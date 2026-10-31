---
layout: post
title:  "How overlay filesystems work, and what to watch out for"
date:   2025-05-18 00:00:00 +0800
categories: [Linux, Filesystems]
description: >-
  I looked into overlayfs while working on fast container startup. How copy-up, whiteouts and layers work, the gotchas, and what I found about eStargz, Nydus and fuse-overlayfs.
tags: [overlayfs, filesystems, containers]
---

I looked into overlay filesystems while working on fast container startup for
short workloads. A container image is a stack of layers, and `overlayfs` is
what turns them into a single root filesystem for the container, so I started
there before looking at the alternatives, like lazy loading of images.

An overlay mount combines one or more read-only lower directories with a
writable upper directory, and shows the result in a merged directory. Reads
come from whichever layer has the file, and writes always go to the upper
directory, so the lower ones are never modified.

All the examples below run as root, in an empty directory (`/tmp/ovl` here).
Mounts themselves are covered in the
[post on mount namespaces](/posts/linux-mount/).

## A first overlay mount

An overlay needs four directories: the lower layer, the upper layer, a work
directory that overlayfs uses internally, and the mount point:

```sh
mkdir lower upper work merged
echo "from the lower layer" > lower/hello.txt && echo bye > lower/old.txt
mkdir lower/conf.d && touch lower/conf.d/a.conf lower/conf.d/b.conf
mount -t overlay overlay -o lowerdir=lower,upperdir=upper,workdir=work merged
ls merged; ls upper
```
```
conf.d
hello.txt
old.txt
```

The merged view shows the lower layer, and the upper layer is still empty.
The lower directories must not be modified while they are part of a mounted
overlay, which is why all the files are created first.

## Copy-up

Let's modify a file from the lower layer through the merged view:

```sh
echo "changed in merged" > merged/hello.txt
cat lower/hello.txt; cat upper/hello.txt
```
```
from the lower layer
changed in merged
```

The first write to a lower file copies it up: the whole file is copied to the
upper directory, then modified there. The lower file is untouched.

A detail that is easy to get wrong when working out where a file came from:
the inode number in the merged view doesn't change after the copy-up.

```sh
stat -c "%i %n" lower/hello.txt upper/hello.txt merged/hello.txt
```
```
680228 lower/hello.txt
680234 upper/hello.txt
680228 merged/hello.txt
```

When the layers are on the same filesystem, overlayfs keeps showing the lower
file's inode number, so that it stays stable for programs that rely on it. To
know which layer a file comes from, look in the upper directory instead.

## Deleting files: whiteouts

A file from the lower layer can't be deleted, since the lower layer is never
modified. Instead, overlayfs creates a whiteout in the upper directory:

```sh
rm merged/old.txt
ls merged; ls -l upper/old.txt
```
```
conf.d
hello.txt
c--------- 2 root root 0, 0 Oct 31 11:07 upper/old.txt
```

A whiteout is a character device with major and minor numbers `0, 0`. When
overlayfs sees one in the upper layer, it hides the file with the same name in
the lower layers.

## Replacing directories: opaque directories

Deleting a directory and creating a new one with the same name is a bit
different:

```sh
rm -r merged/conf.d && mkdir merged/conf.d && touch merged/conf.d/new.conf
ls merged/conf.d; ls lower/conf.d
```
```
new.conf
a.conf
b.conf
```

Only `new.conf` is visible, even though `a.conf` and `b.conf` are still in the
lower layer. The new directory in the upper layer is marked as opaque, with an
extended attribute, which tells overlayfs not to look into the lower layers
for its content:

```sh
python3 -c 'import os; print(os.getxattr("upper/conf.d", "trusted.overlay.opaque"))'
```
```
b'y'
```

(`getfattr -n trusted.overlay.opaque upper/conf.d` shows the same thing, if
the `attr` package is installed.)

```sh
umount merged
```

## Several lower layers

`lowerdir` accepts a list of directories separated by `:`, and the leftmost one
is on top:

```sh
mkdir layer1 layer2 upper2 work2 merged2
echo "from layer1" > layer1/app.conf && echo "from layer2" > layer2/app.conf && echo "only in layer2" > layer2/extra.conf
mount -t overlay overlay -o lowerdir=layer1:layer2,upperdir=upper2,workdir=work2 merged2
cat merged2/app.conf merged2/extra.conf
```
```
from layer1
only in layer2
```

```sh
umount merged2
```

This is how container images are mounted: each image layer is a lower
directory, and the container gets its own upper directory. Docker's `overlay2`
storage driver keeps the layers under `/var/lib/docker/overlay2/` and supports
up to 128 lower layers.

Image layers are tar files, which can't contain overlayfs whiteouts. The OCI
image format represents a deleted file as an empty file named with a `.wh.`
prefix (`.wh.old.txt`), and an opaque directory with a `.wh..wh..opq` file.
These are turned into whiteouts and opaque directories when the layers are
unpacked for overlayfs.

## Which filesystems can be used

The work directory must be on the same filesystem as the upper directory. The
lower layers can be on other filesystems, for example a tmpfs:

```sh
mkdir mem && mount -t tmpfs mem mem && mkdir mem/lower mem/work && echo "on tmpfs" > mem/lower/x
stat -f -c "%T %n" mem/lower upper2
mount -t overlay overlay -o lowerdir=mem/lower,upperdir=upper2,workdir=work2 merged2 && cat merged2/x
```
```
tmpfs mem/lower
ext2/ext3 upper2
on tmpfs
```

But with the work directory on the tmpfs and the upper directory on ext4, the
mount fails, with a message that doesn't say why:

```sh
umount merged2
mount -t overlay overlay -o lowerdir=lower,upperdir=upper2,workdir=mem/work merged2
```
```
mount: /tmp/ovl/merged2: wrong fs type, bad option, bad superblock on overlay, missing codepage or helper program, or other error.
       dmesg(1) may have more information after failed mount system call.
```

The actual reason is in the kernel log (`dmesg`). The upper filesystem also
has to support extended attributes, which rules out some network filesystems.

## Copy-up gotchas

Copy-up copies the whole file, even when only the metadata changes. A `chmod`
on a 100 MB file:

```sh
mkdir l3 u3 w3 m3 && head -c 100M /dev/zero > l3/big.bin
mount -t overlay overlay -o lowerdir=l3,upperdir=u3,workdir=w3 m3
chmod +x m3/big.bin && du -sh u3
```
```
101M	u3
```

With the `metacopy=on` option, only the metadata is copied up, and the data is
still read from the lower layer until the file is written to:

```sh
umount m3 && rm -rf u3 w3 && mkdir u3 w3
mount -t overlay overlay -o lowerdir=l3,upperdir=u3,workdir=w3,metacopy=on m3
chmod +x m3/big.bin && du -sh u3
```
```
8.0K	u3
```

Hard links are the other surprise. If two names point to the same file in the
lower layer, writing through one of them only copies up that one, and the link
is broken:

```sh
umount m3
mkdir l4 u4 w4 m4 && echo one > l4/a && ln l4/a l4/b
mount -t overlay overlay -o lowerdir=l4,upperdir=u4,workdir=w4 m4
echo two > m4/a && cat m4/a m4/b
```
```
two
one
```

The `index=on` option keeps track of copied-up files, and preserves hard
links:

```sh
umount m4 && rm -rf u4 w4 && mkdir u4 w4
mount -t overlay overlay -o lowerdir=l4,upperdir=u4,workdir=w4,index=on m4
echo two > m4/a && cat m4/a m4/b
```
```
two
two
```

Both options are off by default on this kernel. The defaults depend on how the
kernel was built, and can be checked in `/sys/module/overlay/parameters/`:

```sh
umount m4
cat /sys/module/overlay/parameters/metacopy /sys/module/overlay/parameters/index
```
```
N
N
```

## Overlays without root

Mounting an overlay used to require root. Since Linux 5.11, it's also allowed
inside a user namespace, which is what rootless container tools rely on. As a
normal user, in a directory owned by that user:

```sh
mkdir lower upper work merged && echo "from lower" > lower/f
mount -t overlay overlay -o lowerdir=lower,upperdir=upper,workdir=work merged
```
```
mount: /tmp/ovl-rootless/merged: must be superuser to use mount.
       dmesg(1) may have more information after failed mount system call.
```

```sh
unshare --user --map-root-user --mount sh -c 'mount -t overlay overlay -o lowerdir=lower,upperdir=upper,workdir=work merged && cat merged/f'
```
```
from lower
```

Before that, rootless tools used `fuse-overlayfs`, which implements the same
thing in user space, on top of FUSE (see the [post on FUSE](/posts/fuse/)).

## Performance

To get an idea of the overhead, I compared random reads on files spread over
10 lower layers with the same reads on files in a normal directory:

```sh
mkdir upper work merged baseline
for i in {0..9}; do mkdir lower$i; head -c 1M /dev/urandom > lower$i/file$i; head -c 1M /dev/urandom > baseline/file$i; done
mount -t overlay overlay -o lowerdir=$(ls -d lower* | paste -sd:),upperdir=upper,workdir=work merged
fio --name=randread --rw=randread --bs=4k --runtime=10s --time_based --group_reporting --numjobs=4 --filename=$(ls merged/file* | paste -sd:) --size=100%
fio --name=randread --rw=randread --bs=4k --runtime=10s --time_based --group_reporting --numjobs=4 --filename=$(ls baseline/file* | paste -sd:) --size=100%
```

On my personal laptop, with an SSD and ext4, the bandwidth was 486MB/s on the
overlay mount and 588MB/s on the baseline directory, so an overhead of about
17%.

## Lazy loading and the alternatives

With overlayfs, all the layers of an image have to be downloaded and unpacked
before the container can start, which is what makes startup slow for large
images. The alternatives I looked at:

* [eStargz](https://github.com/containerd/stargz-snapshotter) is an image
  format that lets the runtime fetch files on demand, instead of pulling whole
  layers first. It helps startup time, but it requires converting the existing
  images to this format.
* [Nydus](https://nydus.dev/) also loads images on demand, with its own image
  format and daemon. It is operationally complex, with many places where
  things can go wrong.
* [fuse-overlayfs](https://github.com/containers/fuse-overlayfs) comes with a
  non-negligible performance cost, and file metadata and partition handling
  are tricky.

## Additional resources

* [The kernel documentation on overlayfs](https://docs.kernel.org/filesystems/overlayfs.html),
  which covers all the mount options, including `metacopy`, `index` and
  `redirect_dir`.
* [The OCI image layer specification](https://github.com/opencontainers/image-spec/blob/main/layer.md),
  for how whiteouts are stored in image layers.
