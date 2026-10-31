---
layout: post
title:  "Understanding Mounts and Mount Namespaces in Linux"
date:   2025-05-04 00:00:00 +0800
categories: [Linux, Filesystems]
description: >-
  A deep dive into Linux mounts: mount types, how mounting works internally, mount propagation, and how mount namespaces isolate containers.
tags: [mounts, namespaces, containers, filesystems]
---

## 🧠 Introduction

If you’ve ever worked on Linux, you’ve almost certainly encountered **mounts**
— even if you’ve never had to manage them directly. Whether it’s plugging in a
USB drive, accessing `/proc`, or running applications that write to `/tmp`,
mounts are quietly doing the work behind the scenes.

And if you’ve worked with **containers**, you’ve probably come across commands
or configuration options like `--mount`, `--bind`, `rshared`, or `rslave`.
These options often appear in Docker, Kubernetes, or Podman, and while they
sound technical, their underlying behavior can feel mysterious if you haven’t
dug into the details.

This article aims to bridge that gap.

We’ll start by demystifying the **mount system in Linux** — what a mount
actually is, the different types of mounts, and how they tie into the Linux
filesystem model. From there, we’ll explore **namespaces**, with a special
focus on **mount namespaces**, and how they enable filesystem isolation — a key
building block for containers and sandboxed environments.

By the end, you’ll have a clear mental model of how Linux manages mounts, how
mount namespaces affect what a process sees, and why options like `bind`,
`rprivate`, or `shared` matter — especially if you're working on container
infrastructure or doing low-level systems programming.

---

## 📂 What Is a Mount?

### 🪟 From Drives to Trees: Why Linux Mounts Work Differently

If you're coming from a Windows background, you're probably used to working
with drive letters: `C:\`, `D:\`, `E:\`, and so on. Each storage device —
internal disk, USB drive, or network share — gets its own root, and paths are
anchored to a specific device.

Linux (and Unix-like systems) take a radically different approach.

Instead of exposing each device as its own root, **Linux presents a unified
file hierarchy**. Everything — your hard disk, USB drives, pseudo-filesystems
like `/proc`, and even network shares — is **attached somewhere inside a single
tree** rooted at `/`.

This is where the concept of a `mount` comes in.

---

### 📌 The Official Definition

> A mount in Linux is the act of attaching a filesystem (real or virtual) to a
> directory within the existing file hierarchy.

This directory is called the **mount point**, and once mounted, the contents of
the filesystem become accessible under that path.

Think of it as taking a box of files and plugging it into a specific folder in
your system. That folder now shows the contents of the mounted filesystem —
replacing anything that was there before (at least temporarily).

---

### ❓ Why Do We Need Mounts?

Without mounts, Linux would have no way to dynamically incorporate different
filesystems — or even virtual representations of system resources — into a
single navigable structure.

Imagine if:

* `/home` were fixed to a specific disk forever
* `/proc` and `/sys` were baked into the kernel and couldn’t be turned off
* You couldn't mount a USB stick at an arbitrary location like `/mnt/usb` or
`/media/mydrive`

Mounts solve this by allowing **flexible composition**: you can plug any
filesystem into any location in the tree at runtime. This is essential for
things like chroot environments, container filesystems, device isolation, and
even live debugging.

---

### 🧱 Examples of Common Mounts

Let’s look at a few mounts you probably interact with every day, even if you
didn’t realize it:

| Mount Point | Type        | Purpose                                    |
| ----------- | ----------- | ------------------------------------------ |
| `/`         | Physical FS | Root of the system, usually your main disk |
| `/home`     | Physical FS | Often a separate disk or partition         |
| `/tmp`      | `tmpfs`     | In-memory scratch space for temp files     |
| `/proc`     | `procfs`    | Virtual FS exposing kernel data structures |
| `/sys`      | `sysfs`     | Exposes device/driver info from kernel     |
| `/dev`      | `devtmpfs`  | Populated by `udev`, shows devices         |
| `/run`      | `tmpfs`     | Runtime files (e.g., PID files, sockets)   |
| `/mnt/data` | External    | USB drive, remote volume, or image mount   |

These all appear to be part of one unified directory structure, but they may
come from completely different sources — physical drives, memory-based
filesystems, or kernel APIs.

---

## 🔧 Types of Mounts in Linux (In Depth)

### 🧱 Device Mounts (Block Device Filesystems)

These are mounts of block devices like hard drives, SSDs, USB drives, or disk
partitions, usually formatted with filesystems like `ext4`, `xfs`, `btrfs`,
etc.

**Under the hood**:
* Devices are represented as special files like `/dev/sda1`, exposed by the
kernel.
* Filesystems are parsed by filesystem-specific kernel modules (e.g.,
`ext4.ko).
* The `mount` syscall connects the block device’s superblock to a mount point.

**Example**:

```bash
sudo mkdir /mnt/usb
sudo mount /dev/sdb1 /mnt/usb
```

You can specify the type:

```bash
sudo mount -t ext4 /dev/sdb1 /mnt/usb
```

The kernel identifies the filesystem via its superblock or user-specified `-t`
option. Mount options (`-o`) like `noatime`, `ro`, or `nosuid` are passed to
the filesystem driver.

Unmount:

```bash
sudo umount /mnt/usb
```

---

### 🧠 Virtual Filesystems (procfs, sysfs, devtmpfs, tmpfs)

These are not backed by storage. Instead, the kernel exposes internal data
structures and devices as a virtual filesystem.

**Common types**:
* `procfs` (`/proc`): exposes process info, memory maps, CPU stats, etc.
* `sysfs` (`/sys`): exposes kernel objects (devices, drivers, kernel config)
* `devtmpfs` (`/dev`): managed by `udev`, shows devices like `/dev/sda`,
`/dev/null`
* `tmpfs` (`/run`, `/tmp`): an in-memory filesystem that behaves like
RAM-backed storage

**Example**:

```bash
sudo mkdir -p /mnt/chroot/proc
sudo mount -t proc proc /mnt/chroot/proc
```

These are essential for containers, chroot environments, and sandboxing.

---

### 💾 tmpfs (Temporary In-Memory Filesystems)

`tmpfs` behaves like a regular filesystem but resides entirely in RAM (or swap
if needed).

**Features**:
* Fast access, ideal for `/tmp`, `/run`, `/dev/shm`
* Mount options include size limits, inodes, permissions
* Volatile: contents disappear on reboot or unmount

**Example**:

```bash
sudo mkdir /mnt/scratch
sudo mount -t tmpfs -o size=256M tmpfs /mnt/scratch
```

You can control usage via `df` or `du`.

Unmount:

```bash
sudo umount /mnt/scratch
```

---

### 🔗 Bind Mounts

Bind mounts expose an existing directory at a new location — **not a copy, but
a second reference** to the same inode subtree.

**How it works**:
* `mount --bind` reuses the existing mount’s superblock and dentry tree
* Unlike symbolic links, these are transparent to the kernel and userland
* They retain ownership, permissions, and device semantics

Example:

```bash
sudo mkdir /mnt/logs
sudo mount --bind /var/log /mnt/logs
```

Read-only bind mount (note the remount):

```bash
sudo mkdir /mnt/logsro
sudo mount --bind -o ro /var/log /mnt/logsro
```

---

This is often used in chroots, containers, and sandboxed test environments.

### 🔄 Loopback Mounts (Loop Devices)

Mount regular files as if they were block devices. Loop devices create a pseudo
block device mapped to a file.

**Technical notes**:
* The `loop` module creates `/dev/loopX` devices
* Backing file is treated like a raw disk: parsed by `mkfs`, `mount`, etc.
* Useful for ISO files, VM images, and sandboxing

**Example**:

```bash
dd if=/dev/zero of=fs.img bs=1M count=50
mkfs.ext4 fs.img

# Automatic loop setup
sudo mkdir /mnt/image
sudo mount -o loop fs.img /mnt/image

# Manual control
sudo losetup -fP fs.img   # finds and attaches a loop device
sudo mount /dev/loop0 /mnt/image
```

Unmount:

```bash
sudo umount /mnt/image
sudo losetup -d /dev/loop0
```

---

### 🌐 Network Mounts (NFS, CIFS, SMB, etc.)

Mount remote filesystems over the network.

**NFS example**:

```bash
sudo mount -t nfs 192.168.1.100:/exports/data /mnt/nfs
```

**CIFS/SMB example**:

```bash
sudo mount -t cifs //server/share /mnt/smb -o user=guest,password=guest
```

These rely on client kernel modules (`nfs`, `cifs`) and may require specific
ports and user credentials.

Unmount:

```bash
sudo umount /mnt/nfs
```

---

### 🗂️ OverlayFS (Union Mounts)

OverlayFS lets you create a **stacked filesystem** composed of a read-only
lower layer and a writable upper layer.

**Structure**:

```
lowerdir/  → read-only base (e.g., system image)
upperdir/  → writable overlay (e.g., container diff)
workdir/   → internal state (required)
merged/    → unified view presented to users
```

**Example**:

```bash
mkdir lower upper work merged
echo "base" > lower/file.txt

sudo mount -t overlay overlay -o \
  lowerdir=lower,upperdir=upper,workdir=work merged

# Read file from lower layer
cat merged/file.txt    # base

# Modify via upper layer
echo "override" > merged/file.txt

# View from overlay
cat merged/file.txt    # override

# Lower dir remains untouched
cat lower/file.txt     # base
```

OverlayFS is heavily used in container runtimes to simulate a writable rootfs
from immutable image layers.

Unmount:

```bash
sudo umount merged
```

Overlay behavior is subtle when files are deleted or masked (whiteouts), so
it’s worth experimenting.

---

### 🔌 FUSE Mounts: Filesystems in Userspace

In traditional Linux mounts, the kernel handles filesystem logic — it parses
inodes, manages caches, and performs reads/writes via drivers like `ext4` or
`xfs`.

But what if you want to implement a filesystem entirely in **userspace**,
without writing a kernel module?

That’s what **FUSE** (Filesystem in Userspace) is for.

---

#### 💡 What Is FUSE?

FUSE is a kernel module (`fuse.ko`) and userspace interface that lets
non-privileged processes implement filesystems. The kernel delegates filesystem
operations (like `read()`, `write()`, `getattr()`) to a userspace daemon via a
`/dev/fuse` interface.

This enables:
* User-controlled filesystems (even without `CAP_SYS_ADMIN`)
* Development and testing of new filesystems without kernel work
* Filesystems that are network-backed, encrypted, or entirely synthetic

---

#### 🔍 How FUSE Mounts Work

Under the hood:
* You run a userspace daemon (e.g. `sshfs`, `fuse-overlayfs`)
* It tells the kernel to mount via `/dev/fuse`
* All file operations under the mount point are **forwarded to the daemon**

FUSE filesystems are visible in `/proc/self/mounts` like so:

```
fuse.sshfs /mnt/remote fuse.sshfs rw,nosuid,nodev,relatime,user_id=1000,...
```

---

#### 🧪 Example: fuse-overlayfs

Most OverlayFS implementations require root, because overlaying filesystems
involves special kernel operations. But `fuse-overlayfs` allows similar
functionality from userspace — no root needed.

This is used in:
* Rootless Podman
* User-mode build tools
* Testing overlay behavior without privileged access

**Setup example**:

```bash
mkdir lower upper work merged
echo "base" > lower/foo.txt

# Requires fuse-overlayfs installed
fuse-overlayfs -o lowerdir=lower,upperdir=upper,workdir=work merged &
```

Now the `merged/` directory shows the combined view:

```bash
cat merged/foo.txt    # base
echo "new" > merged/foo.txt
cat merged/foo.txt    # new

cat lower/foo.txt     # still base
```

When the FUSE process exits, the mount disappears — or you can unmount with:

```bash
fusermount3 -u merged
```

> ⚠️ FUSE mounts are tightly coupled to the process that started them. If the
> daemon crashes, the mount breaks.

#### 🔐 Security & Permissions

* **Non-root users can mount FUSE filesystems** as long as they have access to
`/dev/fuse`. This is typically allowed on most Linux systems out of the box.
* The `allow_other` mount option allows **other users** (besides the one who
created the mount) to access the mounted filesystem.

---

## 🧠 How Mounting Works Internally

When you call mount from the shell, you are invoking the `mount(2)` **system
call**, which tells the kernel to:
* Resolve the **source** (device or filesystem)
* Parse or load the **filesystem type** (`ext4`, `proc`, `overlay`, etc.)
* Look up or create the **mount point** as a `dentry` in the current namespace
* Associate the **superblock** of the source with the mount point
* Apply **mount options** (e.g., `ro`, `nosuid`, `nodev`, `relatime`)
* Register the new mount in the **mount table** (internal kernel structure)

This mount table is:
* Specific to a **mount namespace** (we’ll cover this in depth soon)
* Exposed to userland via `/proc/self/mounts` and `/proc/self/mountinfo`

Each mount point is tracked in a **mount tree**, which links parent and child
mount points — necessary for handling **binds, overlays, and propagation**.

You can inspect the mount tree like this:

```bash
findmnt --tree
```

Or drill into internal details:

```bash
cat /proc/self/mountinfo
```

This file includes:
* Mount ID
* Parent mount ID
* Major/minor device
* Root and mount point paths
* Optional propagation flags

---

## 🔄 Mount Propagation: Who Sees Your Mount?

When you mount a filesystem, it shows up in your current **mount namespace** —
but does it also show up elsewhere? Can other processes see it? Will it affect
the host if you’re inside a container?

These questions are answered by the concept of **mount propagation**.

---

### 🧠 What Is Mount Propagation?

Mount propagation controls **how mount and unmount events spread between mount
points** — across bind mounts and mount namespaces.

> It defines the "reach" of a mount action: who gets to see it, and who doesn't.

This matters most when you:
* Use **bind mounts**
* Operate inside **mount namespaces** (e.g. in containers, chroots, or
`unshare`)
* Build layered or sandboxed environments

---

### 🔧 The Four Propagation Modes

Each mount point has a **propagation mode**, which determines how it interacts
with other mounts. The main modes are:

| Mode         | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `shared`     | Mount/unmount events propagate **to and from** this mount    |
| `private`    | No propagation in **either direction**                       |
| `slave`      | Events propagate **into** this mount point, but **not out**  |
| `unbindable` | Cannot be bind-mounted elsewhere (used for strong isolation) |


You can view the mode using:

```bash
findmnt -o TARGET,PROPAGATION
```

And set it using:

```bash
mount --make-shared     /mnt/point
mount --make-private    /mnt/point
mount --make-slave      /mnt/point
mount --make-unbindable /mnt/point
```

Note: These don’t change *what* is mounted — they change how mount events
propagate **from that point downward** in the mount hierarchy.

---

### 🧪 Practical Example: Why This Matters

Let’s say you’re in a container (i.e. mount namespace), and you mount a tmpfs:

```bash
mount -t tmpfs none /data
```

If `/` is a shared mount (default on many distros), **this mount leaks into the
host** — unless you’ve first isolated the propagation:

```bash
mount --make-rprivate /
mount -t tmpfs none /data
```

Now the mount stays local to your namespace — no surprises.

---

### 📚 Typical Patterns

| Use Case                             | Propagation Needed          |
| ------------------------------------ | --------------------------- |
| Full isolation (e.g., test sandbox)  | `--make-private /`          |
| Containers that need volume mounts   | `shared` (host ↔ container) |
| One-way propagation (host → sandbox) | `slave`                     |
| Prevent accidental re-binds          | `unbindable`                |

To recursively apply a mode to all mounts:

```bash
mount --make-rprivate /
```

This is commonly done at the start of an `unshare` or container entrypoint.

---

### 🔎 How to Inspect Propagation

Look at `/proc/self/mountinfo`:

```bash
cat /proc/self/mountinfo
```

You’ll see lines like this:

```bash
36 25 0:32 / / rw,relatime shared:1 - ext4 /dev/sda1 rw
```

The `shared:X` or `private`, `slave` keywords show the propagation mode. If no
tag appears, it’s private by default.

---

### Common Gotchas

* Creating a mount namespace **without making root private** leads to
unintentional mount leaks.
* Bind mounts **inherit** propagation from the source unless remounted
explicitly.
* Some distros default to `shared` propagation on `/` — which surprises users
expecting isolation.

---

## 🧪 Try It Yourself: Podman and Mount Propagation

If you’d like to explore how mount propagation works in practice, here are a
few example `podman` commands using different propagation modes:

```bash
# Mount with private propagation (default)
podman run --rm -it \
  --mount type=bind,source=/mnt/data,target=/mnt/container,bind-propagation=rprivate \
  alpine sh

# Mount with slave propagation (host → container only)
podman run --rm -it \
  --mount type=bind,source=/mnt/data,target=/mnt/container,bind-propagation=rslave \
  alpine sh

# Mount with shared propagation (only works in rootful mode)
sudo podman run --rm -it \
  --mount type=bind,source=/mnt/data,target=/mnt/container,bind-propagation=rshared \
  alpine sh
```

📝 It’s left as an exercise for the reader to try these out, observe how mounts
behave across the host and container, and inspect the results using `findmnt`,
`mount`, and `cat /proc/self/mountinfo`.

## 🐳 How Containers Use Mount Namespaces

Mount namespaces are one of the fundamental building blocks of containers.
Along with user, network, and PID namespaces, they allow containers to act like
independent machines — while running on the same host.

Let’s break down what mount namespaces do in a typical container runtime (like
Podman or Docker), and why they’re so powerful.

---

### 🧱 Isolating the Root Filesystem

When a container starts, it gets its **own mount namespace** with a custom root
filesystem, often based on a minimal Linux distribution like Alpine or Ubuntu.

This root is usually built from:
* A base **read-only image layer**
* A **writable upper layer** (tmpfs or OverlayFS)
* Additional **volume mounts** from the host (e.g. `/mnt/data`)

Inside the container:

```bash
# This is a real directory tree, isolated from the host
ls /
# bin etc home lib proc tmp usr ...
```

Outside the container:

```bash
ls /
# Your host’s full root filesystem — completely different
```

---

### 🔍 Why `/proc`, `/dev`, and `/sys` Are Remounted

Even though these are part of the host filesystem, container runtimes **remount
them inside the container**, often with controlled visibility:

| Mount   | Type                | Purpose                                   | Flags                                |
| ------- | ------------------- | ----------------------------------------- | ------------------------------------ |
| `/proc` | `proc`              | Expose process info (PID namespace-aware) | `nosuid`, `noexec`, `hidepid=2`      |
| `/sys`  | `sysfs`             | Limited kernel info                       | Usually read-only in containers      |
| `/dev`  | `tmpfs` + dev nodes | Isolated device interface                 | Often mounted with `nodev`, `nosuid` |

These are essential for functionality inside containers — but must be isolated
to avoid exposing or interfering with host state.

---

### 🧩 OverlayFS and Union Mounts

Container filesystems are typically built using **OverlayFS**, which merges
multiple layers:
* **Lower layer(s)**: read-only image layers (from the container image)
* **Upper layer**: writable layer for runtime changes
* **Workdir + merged mount**: required by OverlayFS

Example (simplified):

```bash
/var/lib/containers/storage/overlay/<id>/merged → container root
```

Everything a container does — writing logs, modifying `/etc`, installing
packages — goes into the upper layer. The lower image layers are shared and
immutable.

---

### 🔒 Why Mount Namespaces Matter

Because containers run in their own mount namespaces, they can:
* Have a private `/` filesystem
* Mount or unmount things without affecting the host
* See different devices, volumes, and pseudo-filesystems
* Be restricted in what they can see (`rprivate`, `hidepid`, etc.)

Without mount namespaces, every container mount would affect the global system
— which would be dangerous and completely break isolation.

---

## 🧰 Inspecting and Debugging Mount Namespaces

Mount namespaces are invisible by default — but Linux provides tools to
inspect, trace, and even **enter** other namespaces. Let’s look at how to
explore mount namespaces at runtime.

---

### 🔎 `lsns`: List All Namespaces

`lsns` shows active namespaces on the system, grouped by type.

```bash
lsns -t mnt
```

Output:

```bash
NS TYPE   NPID PID   USER     COMMAND
4026531840 mnt    1     root     /sbin/init
4026532756 mnt  31245  user     podman run ...
```

Each row corresponds to a distinct mount namespace. The `NS` column shows the
inode ID of the namespace (unique per type).

---

### 🔍 `/proc/<pid>/ns/mnt`: Per-Process Mount Namespace

Every process has a symlink to its namespace:

```bash
readlink /proc/$$/ns/mnt
# e.g., mnt:[4026532756]
```

You can compare two processes to see if they’re in the same mount namespace:

```bash
readlink /proc/1/ns/mnt
readlink /proc/$(pgrep containerd)/ns/mnt
```

If the IDs differ, they’re in separate mount namespaces.

---

### 🚪 `nsenter`: Enter Another Mount Namespace

If you have permissions, you can enter another process’s namespace:

```bash
sudo nsenter --target <PID> --mount bash
```

This launches a shell in **that process’s mount view**.

Common use case:

```bash
# Enter a running Podman container
podman ps
podman inspect --format '{% raw %}{{.State.Pid}}{% endraw %}' <container_id>

# Then:
sudo nsenter --target <PID> --mount bash
```

Now you're inside the container’s mount namespace — helpful for inspecting
mounts, fixing things, or understanding runtime internals.

---

### 🧭 `findmnt`, `mount`, `/proc/self/mountinfo`

Inside any process (or after `nsenter`), use:

```bash
findmnt --target /mnt
cat /proc/self/mounts
cat /proc/self/mountinfo
```

These commands show:
* What’s mounted
* Where it came from
* Whether it’s shared, private, slave
* Which device and filesystem type it uses

---

### 🔧 Bonus: Inspect from the Host

Even without `nsenter`, you can examine container mounts from the host:

```bash
sudo ls /proc/<container_pid>/root/
sudo cat /proc/<container_pid>/mountinfo
```

This lets you trace bind mounts, overlay layers, and pseudo-filesystems.

## 🏁 Conclusion

Mounts and mount namespaces are core to how Linux structures its filesystem —
and how containers achieve isolation, flexibility, and safety. While many
developers use containers daily, few take the time to understand how their
filesystems are assembled and isolated under the hood.

In this article, we’ve:
* Explored what a **mount** really is and why Linux’s unified hierarchy depends
on it
* Learned about different **types of mounts**, from physical devices to virtual
filesystems and loopback images
* Demystified **OverlayFS**, which powers writable container layers
* Dug into **mount propagation** — how mounts spread (or don't) across
namespaces
* Shown how **Podman and containers** use mount namespaces to isolate their
view of the world
* Walked through tools like `lsns`, `nsenter`, and `findmnt` to **inspect and
debug** mount setups

By understanding these mechanics, you’re better equipped to build more secure,
testable, and predictable Linux environments — whether you're designing a
container platform, building sandboxed CI runners, or debugging obscure
production issues.

> 🧪 Still curious? Try experimenting with `unshare`, inspecting mount
> propagation live, or stepping through what your container runtime is really
> doing behind the scenes. There's always more to uncover.
