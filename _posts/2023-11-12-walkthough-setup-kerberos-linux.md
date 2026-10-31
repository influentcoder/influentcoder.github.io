---
layout: post
title:  "Walkthough Guide: How to Set Up Kerberos Authentication on Linux"
date:   2023-11-12 13:22:26 +0800
categories: authentication kerberos
description: >-
  Step-by-step guide to setting up a Kerberos KDC on Linux and using it to authenticate SSH sessions between a client and a server.
tags: [kerberos, ssh, linux, authentication]
---

Setting up Kerberos authentication on Linux can be incredibly useful for
learning how the protocol works, building secure environments, or testing
Kerberized applications. This guide walks you through installing and
configuring a simple Kerberos setup to authenticate SSH sessions across three
Linux machines.

## Use Cases

This guide is useful for:
* Understanding the basics of Kerberos installation and administration on
Linux.
* Creating test environments for developing or debugging Kerberized
applications.

## Prerequisites

You'll need:
* A basic understanding on Linux and Bash.
* Familiarity with the [Kerberos protocol](https://kerberos.org/software/tutorial.html).
* Three Linux hosts:
  * A **KDC (Key Distribution Center)**: `kdc.example.com`
  * An **SSH server**: `server.example.com`
  * An **SSH client**: `client.example.com`

For simplicity, you can use virtual machines or cloud-based instances. This
guide uses Ubuntu, but other distributions should work with equivalent
packages.

---

## Setting up the KDC

We’ll use `EXAMPLE.COM` (in all caps) as our Kerberos realm.

### Step 1: Set the Hostname

```bash
sudo hostnamectl set-hostname kdc.example.com
```

### Step 2: Install Kerberos KDC and Admin Server

```bash
sudo apt update
sudo apt install -y krb5-kdc krb5-admin-server
```

During installation, you’ll be prompted for:
* Default realm: `EXAMPLE.COM`
* Kerberos server: `kdc.example.com`
* Admin server: `kdc.example.com`

### Step 3: Initialize the Kerberos Realm

```bash
sudo krb5_newrealm
sudo systemctl restart krb5-kdc
sudo systemctl restart krb5-admin-server
```

### Step 4: Add Principals and Export Keytab

```bash
sudo kadmin.local
```

Then within the prompt:

```
addprinc john
addprinc -randkey host/server.example.com
ktadd -k /tmp/server.keytab host/server.example.com
quit
```

Copy the keytab to the SSH server:

```bash
scp /tmp/server.keytab user@server.example.com:/tmp/
```

On the server, move it to the correct location:

```bash
sudo mv /tmp/server.keytab /etc/krb5.keytab
sudo chown root:root /etc/krb5.keytab
```

---

## Setting Up the SSH Server

### Step 1: Set the Hostname and Hosts File

```bash
sudo hostnamectl set-hostname server.example.com
```


Edit `/etc/hosts` to add (replace with the real IP addresses):

```
1.2.3.4 kdc.example.com
2.3.4.5 server.example.com
```

### Step 2: Install Kerberos Client

```bash
sudo apt install -y krb5-user
```

Same installation prompts as before:
* Realm: `EXAMPLE.COM`
* Kerberos server: `kdc.example.com`
* Admin server: `kdc.example.com`

### Step 3: Update Kerberos Config

Edit `/etc/krb5.conf` and add to the `[domain_realm]` section:

```
.example.com = EXAMPLE.COM
example.com = EXAMPLE.COM
```

### Step 4: Validate the Keytab

```bash
sudo kinit -kt /etc/krb5.keytab
sudo kdestroy
```

### Step 5: Configure SSH for Kerberos

Edit `/etc/ssh/sshd_config` and ensure the following lines are set:

```
GSSAPIAuthentication yes
GSSAPICleanupCredentials yes
```

Then restart the SSH daemon:

```bash
sudo systemctl restart sshd
```

### Step 6: Add the User Account

```bash
sudo useradd -m -s /bin/bash john
```

---

## Setting Up the SSH Client

### Step 1: Set the Hostname and Hosts File

```bash
sudo hostnamectl set-hostname client.example.com
```

Add to `/etc/hosts` (replace with the real IP addresses):

```
1.2.3.4 kdc.example.com
2.3.4.5 server.example.com
```

### Step 2: Install Kerberos Client

```bash
sudo apt install -y krb5-user
```

Use the same prompts as before.

### Step 3: Authenticate with Kerberos

```bash
kinit john
```

### Step 4: SSH into the Server

```bash
ssh john@server.example.com
```

If everything is set up correctly, Kerberos authentication should “just work.”

---

## Debugging Tips

### Increase SSH Verbosity on the Client

```bash
KRB5_TRACE=/dev/stdout ssh -vvv john@server.example.com
```

### Run a Debugging SSH Daemon on the Server

This avoids disrupting existing SSH connections:

```bash
sudo /usr/sbin/sshd -p 2222 -d -d -d
```

---

## Next Steps

Now that you’ve got Kerberos SSH authentication working in a test environment,
here are some ideas for what you can explore next:

* **Keytab Management**: Learn how to securely distribute and rotate service
keytabs.
* **Integrate with LDAP**: Combine Kerberos with LDAP (e.g. via `sssd`) to
manage user accounts centrally.
* **Multi-Realm Trust**: Set up multiple Kerberos realms and configure
cross-realm trust relationships.
* **Windows Interop**: Integrate with Active Directory to allow SSO between
Linux and Windows systems.
* **Automated Provisioning**: Write scripts or use tools like Ansible to
automate the setup process.
* **Audit & Logs**: Explore how to log and monitor Kerberos authentication
events.
* **Host-Based Access Control**: Use Kerberos principals and `krb5.conf` access
controls to limit where users can log in.

This guide only scratches the surface—Kerberos is a powerful system once you
dig deeper.

---

## Troubleshooting

Here are a few common issues and how to resolve them:

### kinit: Cannot find KDC

**Cause**: The KDC hostname can’t be resolved.

**Fix**: Check your `/etc/hosts` entries or DNS configuration to make sure
`kdc.example.com` is reachable.

### Permission denied (gssapi-keyex,gssapi-with-mic,password).

**Cause**: SSH failed to authenticate using GSSAPI.

**Fix**:

* Run ssh with verbose output:

```bash KRB5_TRACE=/dev/stdout ssh -vvv john@server.example.com ```

* Check that:
  * The SSH server has a valid keytab in `/etc/krb5.keytab`.
  * The SSH daemon has `GSSAPIAuthentication yes` in its config.
  * The `john` user exists on the server.

### kadmin.local: No such principal found

**Cause**: You’re trying to `ktadd` or authenticate a principal that hasn’t
been created.

**Fix**: Double-check that you’ve added all required principals using
`addprinc` in `kadmin.local`.

### Time Skew Errors

**Symptoms**: Authentication fails with errors mentioning "clock skew" or "time
out of bounds."

**Fix**: Ensure that all three machines have synchronized clocks. The easiest
way is to use `ntp` or `chrony`.

```bash sudo apt install -y chrony sudo systemctl enable chrony --now ```

### Keytab Permissions

**Cause**: The keytab file is not readable by the correct user.

**Fix**:

```bash sudo chown root:root /etc/krb5.keytab sudo chmod 600 /etc/krb5.keytab
```

---

If you hit other problems, the [Kerberos
mailing list](https://web.mit.edu/kerberos/mail-lists.html) and [Stack
Overflow](https://stackoverflow.com/questions/tagged/kerberos) are great
resources for help.

--

## Conclusion

Kerberos can seem intimidating at first, but once you understand the core
concepts and get hands-on with a setup like this, it becomes much more
approachable. Whether you're building secure infrastructure, integrating with
enterprise authentication, or just exploring how authentication protocols work
under the hood, Kerberos is a valuable tool to have in your skill set.
