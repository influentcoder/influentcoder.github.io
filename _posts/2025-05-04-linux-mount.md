---
layout: post
title:  "Mount namespaces and mount propagation in Linux"
date:   2025-05-04 00:00:00 +0800
categories: [Linux, Filesystems]
description: >-
  Isolating workloads without containers, and making containers start fast, got me digging into mount namespaces and propagation. Here is what I learned, with experiments to run.
tags: [mounts, namespaces, containers, filesystems]
---

At work, I was working on a compute platform that schedules workloads on
shared hardware. We don't run them in containers, so we do the isolation
ourselves. I also worked on supporting containers for short workloads, where
fast container startup matters, and I looked into things like lazy loading of
images (eStargz) and fuse-overlayfs.

This was a new area for me. I had never really had to dig into how containers
work, and mounts turned out to be a big part of it: what a process sees as its
filesystem is decided by its mount namespace, and by how mounts propagate
between namespaces.

This post goes through both, with experiments you can run on any Linux
machine. Overlay filesystems and FUSE have their own posts:
[overlay file systems](/posts/overlayfs/) and [FUSE](/posts/fuse/).

## Mounts and the mount table

Linux has a single directory tree, and a mount attaches a filesystem at some
directory of that tree (the mount point). The list of mounts a process sees is
its mount table, which `findmnt` shows as a tree, and `/proc/self/mountinfo`
shows in raw form.

The important part is that this mount table is not global. It belongs to a
mount namespace, and every process is in one.

## Setting up the experiments

Everything below runs as root, in two terminals. The first one plays the role
of the host. Let's create a small tmpfs to play with, so we don't touch any
real mount:

```sh
mkdir -p /mnt/demo && mount -t tmpfs demo /mnt/demo && mount --make-shared /mnt/demo
findmnt -o TARGET,FSTYPE,PROPAGATION /mnt/demo
```
```
TARGET    FSTYPE PROPAGATION
/mnt/demo tmpfs  shared
```

Ignore `--make-shared` for now, we'll come back to it.

The outputs below are from a real run. Namespace IDs and mount IDs will be
different on your machine.

## A new mount namespace

In the second terminal, let's start a shell in a new mount namespace:

```sh
unshare --mount bash
```

The two shells are now in different namespaces, which `/proc/self/ns/mnt`
shows. In terminal 1:

```sh
readlink /proc/self/ns/mnt
```
```
mnt:[4026532264]
```

And in terminal 2:

```sh
readlink /proc/self/ns/mnt
```
```
mnt:[4026532265]
```

The new namespace starts with a copy of the mount table, so `/mnt/demo` is
there. Let's mount something under it, in terminal 2:

```sh
mkdir /mnt/demo/from-t2 && mount -t tmpfs t2 /mnt/demo/from-t2 && echo hello > /mnt/demo/from-t2/file
findmnt -o TARGET,FSTYPE /mnt/demo/from-t2; cat /mnt/demo/from-t2/file
```
```
TARGET            FSTYPE
/mnt/demo/from-t2 tmpfs
hello
```

And look for it from terminal 1:

```sh
ls /mnt/demo; findmnt /mnt/demo/from-t2; echo "exit code: $?"; ls /mnt/demo/from-t2
```
```
from-t2
exit code: 1
```

This one surprised me a bit at first. The `from-t2` directory is visible,
because it was created on the `/mnt/demo` tmpfs, which both namespaces use.
But the mount on top of it only exists in terminal 2's namespace, so from
terminal 1 the directory is empty. Namespaces isolate mounts, not files.

## Why the mount didn't leak: propagation

Remember the `--make-shared`? In terminal 1, `/mnt/demo` is shared, which
means mount events under it should propagate to its copies. Yet nothing
propagated. In terminal 2, `findmnt` shows why:

```sh
findmnt -o TARGET,FSTYPE,PROPAGATION /mnt/demo
```
```
TARGET    FSTYPE PROPAGATION
/mnt/demo tmpfs  private
```

`unshare` (since util-linux 2.27) recursively makes every mount private in the
new namespace, so that it's really isolated. This is usually what you want,
but it hides how propagation works. Let's exit the shell in terminal 2 and
start a new one, keeping the propagation as it is:

```sh
unshare --mount --propagation unchanged bash
findmnt -o TARGET,FSTYPE,PROPAGATION /mnt/demo
```
```
TARGET    FSTYPE PROPAGATION
/mnt/demo tmpfs  shared
```

## Shared mounts

Now `/mnt/demo` is shared in both namespaces. Mounting something under it in
terminal 2:

```sh
mkdir /mnt/demo/from-t2 && mount -t tmpfs t2 /mnt/demo/from-t2
```

shows up in terminal 1:

```sh
findmnt -o TARGET,FSTYPE,PROPAGATION /mnt/demo/from-t2
```
```
TARGET            FSTYPE PROPAGATION
/mnt/demo/from-t2 tmpfs  shared
```

And it works the other way too. In terminal 1:

```sh
mkdir /mnt/demo/from-t1 && mount -t tmpfs t1 /mnt/demo/from-t1
```

In terminal 2:

```sh
findmnt -o TARGET,FSTYPE,PROPAGATION /mnt/demo/from-t1
```
```
TARGET            FSTYPE PROPAGATION
/mnt/demo/from-t1 tmpfs  shared
```

What links the two copies of `/mnt/demo` is a peer group. It's visible in
`/proc/self/mountinfo` as `shared:N`. In terminal 1:

```sh
grep /mnt/demo /proc/self/mountinfo
```
```
76 50 0:41 / /mnt/demo rw,relatime shared:1 - tmpfs demo rw
106 76 0:42 / /mnt/demo/from-t2 rw,relatime shared:2 - tmpfs t2 rw
107 76 0:43 / /mnt/demo/from-t1 rw,relatime shared:3 - tmpfs t1 rw
```

And in terminal 2:

```sh
grep /mnt/demo /proc/self/mountinfo
```
```
104 78 0:41 / /mnt/demo rw,relatime shared:1 - tmpfs demo rw
105 104 0:42 / /mnt/demo/from-t2 rw,relatime shared:2 - tmpfs t2 rw
108 104 0:43 / /mnt/demo/from-t1 rw,relatime shared:3 - tmpfs t1 rw
```

The mount IDs (first column) are different, since these are different mounts
in different namespaces, but they are in the same peer groups (`shared:1`,
`shared:2`, `shared:3`). A mount or unmount under one member of a peer group
is replayed under all the others.

## Slave mounts

Often, we want something in between: mounts made on the host should appear in
the namespace, but not the other way around. That's a slave mount. In
terminal 2:

```sh
mount --make-slave /mnt/demo && findmnt -o TARGET,PROPAGATION /mnt/demo
```
```
TARGET    PROPAGATION
/mnt/demo private,slave
```

A new mount in terminal 1:

```sh
mkdir /mnt/demo/from-t1-again && mount -t tmpfs t1b /mnt/demo/from-t1-again
```

still shows up in terminal 2:

```sh
findmnt -o TARGET,FSTYPE /mnt/demo/from-t1-again
```
```
TARGET                  FSTYPE
/mnt/demo/from-t1-again tmpfs
```

But a mount made in terminal 2:

```sh
mkdir /mnt/demo/from-t2-again && mount -t tmpfs t2b /mnt/demo/from-t2-again
```

doesn't show up in terminal 1:

```sh
findmnt /mnt/demo/from-t2-again; echo "exit code: $?"
```
```
exit code: 1
```

In `mountinfo`, the mount in terminal 2 now has `master:1` instead of
`shared:1`: it receives events from peer group 1, but isn't part of it.

```sh
grep /mnt/demo /proc/self/mountinfo | head -1
```
```
104 78 0:41 / /mnt/demo rw,relatime master:1 - tmpfs demo rw
```

## The propagation modes

So there are four modes:

* `shared`: mount events propagate both ways, between all the members of the
  peer group.
* `slave`: events from the master's peer group propagate in, nothing
  propagates out. A mount can be both slave and shared, it then forwards what
  it receives to its own peers.
* `private`: nothing propagates in or out. This is the kernel default for new
  mounts.
* `unbindable`: private, and it also can't be the source of a bind mount.

`mount --make-shared` (and the others) change a single mount. The recursive
versions, `--make-rshared`, `--make-rslave`, `--make-rprivate` and
`--make-runbindable`, change the mount and all the mounts under it, which is
usually what you want for a whole tree like `/`.

To clean up, exit the shell in terminal 2 (which removes its namespace and its
mounts), then in terminal 1:

```sh
umount -R /mnt/demo
```

## What this means for containers

A container runtime does the same thing as `unshare`: it creates a mount
namespace, makes the mounts in it private or slave, then mounts the image's
root filesystem and switches to it. So by default, mounts made on the host
after the container started don't show up inside, and mounts made inside
don't leak to the host.

Bind mounts from the host follow the same rules. Docker's
`bind-propagation` option defaults to `rprivate`. With `rslave`, mounts that
appear later on the host, under the bind-mounted directory, also appear in the
container. `rshared` also sends the container's mounts back to the host, and
only works if the source directory is itself a shared mount on the host.

Without a container runtime, the same building blocks are available directly:
`unshare`, or the `unshare(2)` and `setns(2)` system calls, plus `mount` and
the propagation flags.

## Inspecting mount namespaces

The commands I used above, plus a few more:

* `findmnt -o TARGET,PROPAGATION` shows the propagation of each mount.
* `/proc/<pid>/mountinfo` shows the mount table of any process, with the
  `shared:N` and `master:N` tags.
* `readlink /proc/<pid>/ns/mnt` shows which mount namespace a process is in.
  Two processes with the same value see the same mounts.
* `lsns -t mnt` lists the mount namespaces on the machine, and a process in
  each.
* `nsenter --mount=/proc/<pid>/ns/mnt` runs a command in the mount namespace
  of another process, for example to check what a container really sees.

## Additional resources

* [Shared subtrees](https://docs.kernel.org/filesystems/sharedsubtree.html),
  the kernel documentation on propagation, with many more examples.
* [mount_namespaces(7)](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html),
  which covers the rules in detail, including what happens with user
  namespaces.
