---
layout: post
title:  "Reinstall GRUB on a dual boot setup with Arch Linux and Windows"
date:   2023-12-19 00:00:00 +0800
categories: [Linux, Administration]
description: >-
  A BIOS update from Windows messed up GRUB on my Arch Linux dual-boot laptop. Here's how I got it working again.
tags: [grub, arch-linux, dual-boot, uefi]
---

In this article, we will go through the re-installation of GRUB on a dual-boot setup.
This morning, I was upgrading my BIOS through a Lenovo installer, from Windows.

This has kind of messed up my GRUB setup, and when trying to boot on GRUB, it just went to a GRUB shell
rather than presenting me with the usual boot options. Moreover, when trying `ls` on the GRUB shell, it wasn't
able to detect the filesystem for the Linux partitions, so it seemed quite bad.

My motivation to write this article is for myself, to remember how to get out of this situation again if needs be,
and to help other folks who might face the same issue.

This article is mostly speaking about Arch Linux as this is the distribution I currently use, but some of the steps
might be applicable to other distributions as well.

My machine uses UEFI/GPT, and if you have an older BIOS, things might be a bit different.

## Ensure Windows is still bootable

When rebooting the PC, at the very beginning, enter the BIOS (for my laptop model, I need to press F2).

Make sure to change the BIOS order so that the Windows boot comes before GRUB.

Restart the PC, and hopefully Windows starts as usual. If that's not the case, you might need some more heavy lifting and at worst
a factory reset.

## Create a bootable USB stick with Arch Linux

Skip this step if you already have one.

[Download Arch Linux](https://archlinux.org/download/) as an ISO file.

Then download [Rufus](https://rufus.ie/en/) or any other similar tool, to burn the ISO file on a USB stick.

Once done, plug the USB stick, reboot the PC, and ensure that the USB drive comes first in the boot order in the BIOS.

You should then boot in an in-memory Arch Linux distribution as root.

## Identify the partitions

Run `lsblk` first to check the partitions:

```sh
$ lsblk
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

There's a chance that nothing is mounted, so that's not very helpful.

Run `fdisk -l` and check the results. For me, it looks something like this:

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

This indicates that I have created two partitions for my Linux OS, namely `/dev/nvme0n1p5` and `/dev/nvme0n1p6`.

`/dev/nvme0n1p7` is clearly identified as a swap partition, but for the other two, it might not be clear which one is what.

I generally create two partitions, one for the root folder `/`, and one for `/home`, but depending on how you did it earlier,
it might be different.

Now, it's time to try to identify them.

Let's try to mount the first partition:

```sh
mount /dev/nvme0n1p5 /mnt
```

Then check the contents in `/mnt`:

```sh
ls /mnt
```

If you see something that looks like `bin boot dev ... proc run tmp ...`, then that's probably the root of the filesystem, so all good.

If you see the contents of something else (like `/home`), then unmount it for now until you find the root that you can mount on `/mnt`.

If you have a partition for `/home`, you can mount it on `/mnt/home`:

```sh
mount /dev/nvme0n1p6 /mnt/home
```

Then set up the swap partition:

```sh
swapon /dev/nvme0n1p7
```

Finally, check with `lsblk` again that everything is in order:

```sh
$ lsblk
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

## Reinstall GRUB

The first step is to chroot:

```sh
arch-chroot /mnt
```

If you are not using Arch Linux, check if your distro includes a similar helper for chroot, or just run `chroot` but
you might have to manually mount a few things first (`/proc`, `/sys` and `/dev`).

Make sure to mount the EFI partition to `/boot/efi/`:

```sh
mount /dev/nvme0n1p1 /boot/efi/
```

Then reinstall GRUB with:

```sh
grub-install --target=x86_64-efi --bootloader-id=grub_uefi --recheck
```

And then generate the GRUB config file (you might want to take a copy of the old one):

```sh
grub-mkconfig -o /boot/grub/grub.cfg
```

Once done, remove the USB stick, then reboot the PC.

Now GRUB should be working as per normal. At this stage, there can be one caveat - it's possible that GRUB didn't detect the
Windows partition while in chroot earlier.

Just go to your Arch Linux, mount the EFI directory if it's not already done, and rerun the GRUB config generation:

```sh
grub-mkconfig -o /boot/grub/grub.cfg
```

Now it should be able to detect the Windows partition.

## Additional resources

[This video](https://www.youtube.com/watch?v=JRdYSGh-g3s&t=179s) helped me a lot to install Arch Linux with dual boot in the first place, and to troubleshoot this issue.

[The Arch wiki page on GRUB](https://wiki.archlinux.org/title/GRUB) is also very useful.

[This guide](https://forum.manjaro.org/t/root-tip-how-to-primer-on-handling-a-grub-package-update/154003) also has some useful tips for GRUB package updates.
