---
layout: post
title:  "Reinstall GRUB on a dual boot setup with Arch Linux and Windows"
date:   2023-12-19 00:00:00 +0800
categories: linux
description: >-
  How to recover a dual-boot Arch Linux and Windows machine after a BIOS update breaks GRUB, using an Arch live USB on a UEFI/GPT system.
tags: [grub, arch-linux, dual-boot, uefi]
---

In this post, I'll walk through how to reinstall GRUB on a dual-boot system
with Arch Linux and Windows. 

This morning, I upgraded my BIOS using a Lenovo installer from within Windows.
That ended up messing with GRUB—on reboot, I was dropped into a GRUB shell
instead of seeing the familiar boot options. Worse, GRUB couldn’t even detect
the Linux filesystems using `ls`, which made things look pretty bad.

I’m writing this partly as a personal note in case it happens again, and partly
to help anyone else who runs into the same problem.

I use Arch Linux, so the instructions are Arch-specific, but many of the steps
should apply to other distributions too. My system uses UEFI and GPT; if you're
using legacy BIOS, the steps will differ.

---

## Step 1: Make sure Windows is still bootable

Reboot your computer and enter the BIOS setup (on my Lenovo laptop, this means
pressing `F2` during startup).

In the BIOS settings:

* Make sure the Windows boot entry comes *before* the GRUB entry in the boot
order.
* Save and reboot.

With luck, Windows should boot normally. If not, you may need to do more
serious recovery steps—up to and including a factory reset.

---

## Step 2: Create a bootable USB with Arch Linux

Skip this if you already have one.

1. [Download the Arch ISO](https://archlinux.org/download/).
2. Use [Rufus](https://rufus.ie/en/) or a similar tool to write the ISO to a
   USB stick.
3. Plug in the USB, reboot, and ensure the USB drive is first in the boot
   order.

You should now boot into a live Arch environment.

---

## Step 3: Identify and mount your partitions

First, list available partitions:


```bash
lsblk
```

This might show something like:

```
NAME        MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS
nvme0n1     259:0    0 476.9G  0 disk
├─nvme0n1p1 259:1    0   260M  0 part
├─nvme0n1p2 259:2    0    16M  0 part
├─nvme0n1p3 259:3    0 377.1G  0 part
├─nvme0n1p4 259:4    0     2G  0 part
├─nvme0n1p5 259:5    0    40G  0 part 
├─nvme0n1p6 259:6    0    50G  0 part 
└─nvme0n1p7 259:7    0   7.7G  0 part
```

For more detail, run:

```bash
fdisk -l
```

This might show something like:

```
Device             Start        End   Sectors   Size Type
/dev/nvme0n1p1      2048     534527    532480   260M EFI System
/dev/nvme0n1p2    534528     567295     32768    16M Microsoft reserved
/dev/nvme0n1p3    567296  791318527 790751232 377.1G Microsoft basic data
/dev/nvme0n1p4 996118528 1000214527   4096000     2G Windows recovery environment
/dev/nvme0n1p5 791318528  875204607  83886080    40G Linux filesystem
/dev/nvme0n1p6 875204608  980062207 104857600    50G Linux filesystem
/dev/nvme0n1p7 980062208  996118527  16056320   7.7G Linux swap

Partition table entries are not in disk order.
```

You’ll need to figure out which partition contains your root (`/`) filesystem.
In my case:
* `/dev/nvme0n1p5` is root (`/`)
* `/dev/nvme0n1p6` is `/home`
* `/dev/nvme0n1p7` is `swap`

Mount the root partition:

```bash
mount /dev/nvme0n1p5 /mnt
ls /mnt
```

If you see typical root directories (`bin/`, `boot/`, `etc/`, etc.), you've got
the right partition. Otherwise, unmount and try the other one.

If you have a separate `/home`, mount it too:

```bash
mount /dev/nvme0n1p6 /mnt/home
```

Enable swap:

```bash
swapon /dev/nvme0n1p7
```

Verify with:

```bash
lsblk
NAME        MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS
nvme0n1     259:0    0 476.9G  0 disk
├─nvme0n1p1 259:1    0   260M  0 part
├─nvme0n1p2 259:2    0    16M  0 part
├─nvme0n1p3 259:3    0 377.1G  0 part
├─nvme0n1p4 259:4    0     2G  0 part
├─nvme0n1p5 259:5    0    40G  0 part /
├─nvme0n1p6 259:6    0    50G  0 part /home
└─nvme0n1p7 259:7    0   7.7G  0 part [SWAP]
```

Look for correct mount points, like `/`, `/home`, and `[SWAP]`.

## Step 4: Reinstall GRUB

First, chroot into your system:

```sh
arch-chroot /mnt
```

If you're using a non-Arch distro, use chroot directly but make sure to mount
`proc`, `sys`, `dev`, and other required filesystems.

Next, mount the EFI partition (this is crucial for UEFI setups):

```bash
mount /dev/nvme0n1p1 /boot/efi/
```

Then reinstall GRUB:

```bash
grub-install --target=x86_64-efi --bootloader-id=grub_uefi --recheck
```

Generate the GRUB configuration:

```bash
grub-mkconfig -o /boot/grub/grub.cfg
```

Exit the chroot environment, unmount the partitions (optional), and reboot:

```bash
exit
reboot
```

Remove the USB stick, and hopefully you'll see the GRUB menu again.

---

## If Windows doesn't show up in GRUB

Sometimes GRUB won’t detect Windows while you're in the chroot environment. If
that happens, boot into Arch normally, then:
* Ensure the EFI partition is mounted:
```bash
mount /dev/nvme0n1p1 /boot/efi
```
* Regenerate the GRUB config:
```bash
grub-mkconfig -o /boot/grub/grub.cfg
```

Now GRUB should detect both Arch and Windows.

## Additional resources

* [This video guide](https://www.youtube.com/watch?v=JRdYSGh-g3s&t=179s) helped
me install Arch and fix dual-boot issues.
* The [Arch wiki page on GRUB](https://wiki.archlinux.org/title/GRUB) is also
very useful.
* [This guide](https://forum.manjaro.org/t/root-tip-how-to-primer-on-handling-a-grub-package-update/154003)
contains some useful tips for GRUB package updates.
