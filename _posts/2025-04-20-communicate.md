---
layout: post
title:  "Communicate, Communicate, Communicate: Lessons from a Platform Change Gone Wrong"
date:   2025-04-20 00:00:00 +0800
categories: [Engineering]
description: >-
  When we make changes to a core platform component, running hundreds of millions of times a day, there's another responsibility that's just as important: communication.
tags: [communication, change-management, platform-engineering]
---

As engineers, we often focus on writing safe code, deploying with care, and
measuring performance. But when we make changes to a core platform
component - something that runs in every environment, hundreds of millions of
times a day - there’s another responsibility that’s just as important:
communication.

In large ecosystems, where services and teams are loosely coupled,
communication is the connective tissue. Without it, even a well-tested change
can have unexpected, far-reaching consequences. And when something breaks, the
silence can be just as damaging as the bug.

## A Change That Looked Safe on Paper

Our team recently made what seemed like a low-risk change to one of the most
critical executables in our infrastructure - think of it as the Python
interpreter or the JVM in your stack. It’s launched hundreds of millions of
times a day across the firm.

We introduced a small enhancement: the executable would now read from a
configuration file on startup. We used a mature, third-party library to do
this, expecting it to gracefully deal with all the usual edge cases - missing
file, large file size, bad format, and so on. We had logging, fallbacks, and
good defaults in place. It felt safe.

What we didn’t anticipate was that this library uses file locking while reading
the config file. File locks are known to cause contention on network file
systems. And as it turned out, several teams - unbeknownst to us - stored their
config files on a shared NFS volume.

When our change rolled out, it caused an enormous spike in lock activity on the
NFS. The network file system buckled under the load, effectively becoming a
denial-of-service vector. Worse, the failure manifested in other, unrelated
applications that had nothing to do with our change. They just happened to be
using the same storage.

Debugging the issue was painful. Because we hadn’t broadly communicated the
change, the link between the new config read and the system failures wasn’t
obvious. The impacted teams had no reason to suspect our executable. And to
them, the issue looked like a slow, flaky filesystem - not a platform upgrade.

Had we over-communicated, we could have saved hours - if not days - of collective
debugging effort. Even a short note to relevant engineering groups might have
prompted someone to say, “Hey, we use NFS for our configs - could this affect
us?”

## Smells of a Risky Change

It’s not always obvious when a change needs wide communication. Over time, I’ve
learned to pay attention to certain “smells” - small signals that suggest the
change might be more impactful than it seems.

Changes that should trigger communication:
* It touches code that runs on *every host*, *every request*, or *every
environment*.
* It adds new I/O: reading files, writing to disk, opening sockets, hitting
APIs.
* It introduces a new dependency (especially third-party code).
* It changes startup behavior or default settings - even if fallback logic
exists.
* It relies on assumptions about where files are stored, or how systems behave.
* It could shift performance characteristics (latency, memory, IOPS).

If your change checks even one of these boxes, err on the side of
communication.

## Why Communication Matters (Even When You’re Confident)

1. Context is everything when debugging.  
   When something breaks, engineers often rely on recent changes to help trace
the issue. If your change isn’t on their radar, they’ll waste time looking in
the wrong places.

2. Silent failures damage trust.  
   If your team ships a change that causes outages and you didn’t warn anyone,
it reflects poorly - even if the root cause was hard to foresee. Communication
builds transparency and trust.

3. You don’t know what you don’t know.  
   It’s almost impossible to map every dependency in a large system.
Communication is how you crowdsource awareness. It invites feedback and
uncovers blind spots.

4. You enable others to act.  
   A simple message gives other teams the chance to evaluate risk, adjust
configs, or monitor more closely. Even if the change won’t affect them, they’ll
appreciate being informed.

## Reflections and Lessons Learned

After this incident, our team sat down and did a thorough postmortem. We didn’t
just fix the technical issue - we examined how we could have prevented the
outcome altogether. One of the most important actions we took was to embed
communication as part of our change rollout process.

We now include a communication checklist in every design doc and rollout plan.
We review which systems might be affected and where we need to send
announcements. In our tooling, we also added optional flags to disable new
behaviors like the config read, which makes it easier to back out quickly if
needed.

More importantly, we’ve internalized a simple mantra: "If you touch shared
infrastructure, tell people." You never know whose world you might shake.

## What Good Communication Looks Like

You don’t need to write a novel every time you make a change. But you should
aim to:
* Announce early. A heads-up before deployment gives people time to
prepare.
* Announce widely. Use mailing lists, Slack channels, internal changelogs,
or release notes.
* Be clear and concise. Explain what’s changing, why it matters, and who
might be affected.
* Be realistic. If you’re unsure about the impact, say so - and ask for
feedback.
* Include support info. Let people know what to do and who to contact if
something breaks.

## Sample Email Template for Change Communication

Below is a sample template we’ve found helpful when communicating core or
platform-level changes:

Subject: [Heads-Up] Platform Config Change Rolling Out on [Date]

What is changing:  
We are updating the startup behavior of the core execution environment
(`my-core-binary`) to optionally read from a configuration file located on the
local filesystem. This allows teams to customize runtime behavior more easily
and aligns with our broader goal of making platform components more
configurable.

When is it happening:  
The change will roll out gradually starting Wednesday, April 17, 2025 at
10:00 AM EST. Full deployment expected by Thursday, April 18.

What is the impact:  
Under normal circumstances, there should be no visible impact. The config
file is optional, and failures such as missing or malformed files are handled
gracefully. *[The following paragraph might not be included as we might not
anticipate an issue, but if you do, it's best to include it]* However, we are
aware that file locking is used by the config library, which may cause
performance issues if the config is stored on a network filesystem (e.g.,
NFS). If your application uses shared storage for local runtime configs,
please review this.

What do I do if things go wrong:  
* You can set the `MY_CORE_SKIP_CONFIG` environment variable to bypass the
config read entirely.
* Reach out on the #platform-support Slack channel or file a ticket in the
Platform Support Queue.
* In critical cases, we can temporarily roll back your hosts to the previous
version.

More details:  
Please see [internal wiki link] for technical implementation details, fallback
logic, and example configs.

*(Note: If your team has its own change communication template, please follow
that instead.)*

## Building a Culture of Communication

While tooling and templates help, the real shift happens when communication
becomes a cultural norm. Here are a few things we've found helpful:

* Bake it into the process. Make communication a standard part of rollout
checklists and review questions.
* Centralize visibility. Maintain an internal changelog, weekly digest, or
shared “breaking change” channel.
* Model the behavior. When senior engineers and leads communicate
proactively, others follow suit.
* Celebrate good examples. If someone communicates a change well and saves
others pain, call it out.

The more normalized and expected this behavior becomes, the fewer surprises the
platform throws at its users.

Communicating changes isn’t a chore - it’s a force multiplier. It reduces risk,
accelerates resolution, and fosters collaboration across teams. Even when you
think a change is safe, assume that someone, somewhere, is depending on
something you didn’t know about.

So before you hit that deploy button, ask yourself:

> "Who might need to know about this?"

Then take the time to tell them. The five minutes you spend writing that
message could save your organization hours of downtime.
