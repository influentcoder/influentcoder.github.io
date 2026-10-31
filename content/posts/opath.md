---
title: "Walking untrusted directories with O_PATH and openat2()"
description: >-
  How to walk a directory tree that someone else controls without ending up in /etc: what O_PATH file descriptors and openat2() do, with a race you can reproduce.
publishDate: 2025-05-11
tags: [linux, filesystems, system-calls, security, c]
---

Let's say a service unpacks something a user uploaded, for example a
repository on a CI system, into a temporary directory, and then scans it
before using it. The scan has to stay inside that directory: no `..` tricks, no
symlinks pointing to `/etc`, and no way for the user to swap things around
while the scan is running.

Checking each path with `lstat()` and then opening it looks right, but there is
a window between the check and the use. This post comes from an investigation
I did into `O_PATH` file descriptors and `openat2()`, which are the Linux tools
for closing that window. It shows the race with a program that actually wins
it, then fixes it with them.

Everything below was compiled with gcc 13 and run as root on Linux 6.18.

## A walker that checks paths

This walker rejects symlinks with `lstat()`, and recurses into directories with
`opendir()`, in `naive.c`:

```c
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <dirent.h>
#include <string.h>
#include <unistd.h>

void scan_dir(const char *path) {
    DIR *dir = opendir(path);
    if (!dir) {
        perror("opendir");
        return;
    }

    struct dirent *entry;
    char fullpath[4096];

    while ((entry = readdir(dir)) != NULL) {
        // Skip "." and ".."
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0)
            continue;

        snprintf(fullpath, sizeof(fullpath), "%s/%s", path, entry->d_name);

        struct stat st;
        if (lstat(fullpath, &st) == -1) {
            perror("lstat");
            continue;
        }

        // Check for symlinks
        if (S_ISLNK(st.st_mode)) {
            fprintf(stderr, "Rejected symlink: %s\n", fullpath);
            continue;
        }

        // Recursively scan directories
        if (S_ISDIR(st.st_mode)) {
            scan_dir(fullpath);
        } else {
            printf("Accepted: %s\n", fullpath);
        }
    }

    closedir(dir);
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <path>\n", argv[0]);
        return 1;
    }

    scan_dir(argv[1]);
    return 0;
}
```

On a tree with a nested directory and a symlink to `/etc`, it does what we
expect:

```sh
mkdir -p tree/a/b/c && echo x > tree/top.txt && echo y > tree/a/b/c/deep.txt && ln -s /etc tree/link-to-etc
./naive tree
```
```
Rejected symlink: tree/link-to-etc
Accepted: tree/top.txt
Accepted: tree/a/b/c/deep.txt
```

## Winning the race

The problem is that `lstat()` and `opendir()` each resolve the path again. If
the user replaces a directory with a symlink between the two calls, `lstat()`
sees a directory, and `opendir()` follows the symlink.

To try it, this program, `swap.c`, keeps exchanging `race/upload/legit` (a
directory) with `race/swap` (a symlink to `/etc`). `renameat2()` with
`RENAME_EXCHANGE` swaps them atomically, so at any time one of them is the
directory and the other one the symlink:

```c
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <linux/fs.h>

/* Keep swapping upload/legit (a directory) with swap (a symlink to /etc). */
int main(void)
{
    for (;;)
        renameat2(AT_FDCWD, "race/upload/legit", AT_FDCWD, "race/swap", RENAME_EXCHANGE);
}
```

```sh
gcc -o naive naive.c && gcc -o walk walk.c && gcc -o swap swap.c && gcc -o opath-demo opath-demo.c
mkdir -p race/upload/legit && echo ok > race/upload/legit/file.txt && ln -s /etc race/swap
./swap &
```

Then let's run the walker 2000 times, and count the runs where it listed files
from `/etc`:

```sh
for i in $(seq 2000); do ./naive race/upload 2>&1 | grep -q -E 'legit/(hostname|passwd)$' && echo escaped; done | wc -l
```
```
369
```

In 369 runs out of 2000, the walker accepted files from `/etc` as if they were
part of the upload. The exact number changes from one run to the next, but it
was never close to zero.

## O_PATH file descriptors

`O_PATH` opens a file without opening it for reading or writing. The file
descriptor only refers to a location in the filesystem. From
[`open(2)`](https://man7.org/linux/man-pages/man2/open.2.html), it can't be
used for `read()`, `write()`, `mmap()` and similar (they fail with `EBADF`),
but it can be used with `fstat()`, as the `dirfd` argument of `openat()` and
the other `*at()` calls, passed to another process, and even executed with
`execveat()` and `AT_EMPTY_PATH`. Opening a file with `O_PATH` doesn't need any
permission on the file itself.

This program, `opath-demo.c`, checks a few of these:

```c
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/syscall.h>

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    int fd = open("/etc/hostname", O_PATH);
    char buf[100];
    struct stat st;

    if (read(fd, buf, sizeof(buf)) == -1)
        printf("read:  %s\n", strerror(errno));
    if (fstat(fd, &st) == 0)
        printf("fstat: size=%lld\n", (long long)st.st_size);

    char link[64], target[256];
    snprintf(link, sizeof(link), "/proc/self/fd/%d", fd);
    ssize_t n = readlink(link, target, sizeof(target) - 1);
    target[n] = '\0';
    printf("%s -> %s\n", link, target);

    int exe = open("/bin/echo", O_PATH);
    char *argv[] = {"echo", "executed through an O_PATH fd", NULL};
    char *envp[] = {NULL};
    syscall(SYS_execveat, exe, "", argv, envp, AT_EMPTY_PATH);
    printf("execveat: %s\n", strerror(errno));
    return 1;
}
```

```sh
./opath-demo
```
```
read:  Bad file descriptor
fstat: size=3
/proc/self/fd/3 -> /etc/hostname
executed through an O_PATH fd
```

The interesting part for us is `dirfd`: once we hold a file descriptor for a
directory, we can look up names relative to it, and the kernel resolves them
from that directory, whatever happens to its path afterwards.

## openat2() and its resolve flags

[`openat2()`](https://man7.org/linux/man-pages/man2/openat2.2.html) (Linux 5.6
and later) is `openat()` with extra control over path resolution, through
`struct open_how`:

* `RESOLVE_BENEATH` fails the lookup if it would leave the starting directory,
  for example with `..` or an absolute symlink.
* `RESOLVE_NO_SYMLINKS` fails the lookup if it would follow a symlink. With
  `O_PATH | O_NOFOLLOW`, a symlink as the last component is returned as a file
  descriptor to the symlink itself, so we can detect it with `fstat()`.
* `RESOLVE_IN_ROOT` treats the starting directory as `/`, which is handy for
  container root filesystems.

glibc provides no wrapper for `openat2()`, so it has to be called with
`syscall()`.

## A walker that holds file descriptors

This version, `walk.c`, never builds a path to open. Each directory is held as
an `O_PATH` file descriptor, each entry is opened by its name relative to that
descriptor, and recursion passes the child's descriptor down. The path string
is only used for printing:

```c
#define _GNU_SOURCE
#include <dirent.h>
#include <fcntl.h>
#include <linux/openat2.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

static int openat2_beneath(int dirfd, const char *name)
{
    struct open_how how = {
        .flags = O_PATH | O_NOFOLLOW | O_CLOEXEC,
        .resolve = RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS,
    };
    return syscall(SYS_openat2, dirfd, name, &how, sizeof(how));
}

/* dirfd is an O_PATH fd of the directory to scan; path is only for printing. */
static void scan_dir(int dirfd, const char *path)
{
    int fd = openat(dirfd, ".", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    DIR *dir = fd == -1 ? NULL : fdopendir(fd);
    if (!dir) {
        fprintf(stderr, "Cannot list %s: %s\n", path, strerror(errno));
        return;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0)
            continue;

        char child_path[4096];
        snprintf(child_path, sizeof(child_path), "%s/%s", path, entry->d_name);

        int child = openat2_beneath(dirfd, entry->d_name);
        if (child == -1) {
            fprintf(stderr, "Rejected %s: %s\n", child_path, strerror(errno));
            continue;
        }

        struct stat st;
        if (fstat(child, &st) == -1) {
            fprintf(stderr, "Cannot stat %s: %s\n", child_path, strerror(errno));
        } else if (S_ISLNK(st.st_mode)) {
            fprintf(stderr, "Rejected symlink: %s\n", child_path);
        } else if (S_ISDIR(st.st_mode)) {
            scan_dir(child, child_path);
        } else {
            printf("Accepted: %s\n", child_path);
        }
        close(child);
    }
    closedir(dir);
}

int main(int argc, char **argv)
{
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <path>\n", argv[0]);
        return 1;
    }

    int basefd = open(argv[1], O_PATH | O_DIRECTORY | O_CLOEXEC);
    if (basefd == -1) {
        perror(argv[1]);
        return 1;
    }
    scan_dir(basefd, argv[1]);
    close(basefd);
    return 0;
}
```

On the same tree:

```sh
./walk tree
```
```
Rejected symlink: tree/link-to-etc
Accepted: tree/top.txt
Accepted: tree/a/b/c/deep.txt
```

And against the same race, with `swap` still running:

```sh
for i in $(seq 2000); do ./walk race/upload 2>&1 | grep -q -E 'legit/(hostname|passwd)$' && echo escaped; done | wc -l
```
```
0
```

Here is what it did in each run:

```sh
for i in $(seq 2000); do ./walk race/upload 2>&1; done | sort | uniq -c
```
```
    927 Accepted: race/upload/legit/file.txt
    122 Rejected race/upload/legit: Invalid cross-device link
    951 Rejected symlink: race/upload/legit
```

There are only three outcomes. If `legit` was the directory when it was
opened, the walker keeps a descriptor to that directory and lists it, even if
it gets swapped away right after. If `legit` was the symlink, it gets a
descriptor to the symlink and rejects it. And sometimes `openat2()` refused the
lookup with `EXDEV`, the error it returns under `RESOLVE_BENEATH` when it
detects a possible escape. In no case did it end up in `/etc`.

To stop `swap`:

```sh
kill %1
```

## Where O_PATH is used

This pattern is common in code that sets up containers and sandboxes, where
the paths come from someone else:

* [runc](https://github.com/opencontainers/runc/blob/v1.3.0/libcontainer/utils/utils_unix.go#L183)
  opens paths with `O_PATH` before operating on them through `/proc/self/fd`.
* [bubblewrap](https://github.com/containers/bubblewrap/blob/main/bubblewrap.c),
  used by Flatpak, holds `O_PATH` descriptors while it builds the sandbox's
  mounts.
* systemd resolves paths component by component with `O_PATH` descriptors in
  [chase.c](https://github.com/systemd/systemd/blob/main/src/basic/chase.c).

## Additional resources

* [openat2(2)](https://man7.org/linux/man-pages/man2/openat2.2.html), with all
  the `RESOLVE_*` flags.
* [open(2)](https://man7.org/linux/man-pages/man2/open.2.html), the `O_PATH`
  section lists exactly what an `O_PATH` descriptor can and can't do.
