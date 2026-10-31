---
title: "Slicing and dicing JSON in the terminal with jq"
description: >-
  The jq filters I use the most at work to query and debug JSON APIs from the terminal, and that I keep forgetting the syntax for.
publishDate: 2025-05-25
tags: [tools, jq, json, command-line]
---

I use `jq` a lot at work, mostly when interacting with JSON APIs or debugging
them. The simple cases are easy, but as soon as I need something a bit less
trivial, I can never remember the syntax and end up searching for it again.

So this post is a collection of the patterns I use the most: filtering,
mapping, transforming, and working with arrays. All the examples were run with
`jq` 1.7.

## The example data

Let's say we have this response from a made-up users API, saved in
`users.json`:

```json
{
  "page": 1,
  "total": 4,
  "items": [
    {"id": 101, "name": "alice", "team": "payments", "active": true, "roles": ["admin", "dev"], "last_login": "2025-05-20T09:12:00Z"},
    {"id": 102, "name": "bob", "team": "search", "active": false, "roles": ["dev"], "last_login": null},
    {"id": 103, "name": "carol", "team": "payments", "active": true, "roles": ["dev", "oncall"], "last_login": "2025-05-24T17:45:00Z"},
    {"id": 104, "name": "dave", "team": "search", "active": true, "roles": [], "last_login": "2025-05-23T08:01:00Z"}
  ]
}
```

In practice, the JSON usually comes straight from `curl`, and everything below
works the same way:

```sh
curl -s https://api.example.com/users | jq '.items | length'
```

Two flags I use all the time:
* `-r` prints strings without the quotes, which is what you want when piping to
  other commands.
* `-c` prints each result on one line, which is easier to read when there are
  many small objects.

## Looking around

When I get a response I don't know yet, I start by checking its shape:

```sh
jq '.items | length' users.json
```
```
4
```

```sh
jq '.items[0] | keys' users.json
```
```json
[
  "active",
  "id",
  "last_login",
  "name",
  "roles",
  "team"
]
```

## Filtering

`select` keeps the elements for which the condition is true. Conditions can be
combined with `and` / `or`:

```sh
jq -c '.items[] | select(.active and .team == "payments") | {id, name}' users.json
```
```
{"id":101,"name":"alice"}
{"id":103,"name":"carol"}
```

`{id, name}` is a shortcut for `{id: .id, name: .name}`, and is handy to only
keep the fields I care about.

To filter on the contents of an array field, `any` does the job:

```sh
jq -r '.items[] | select(any(.roles[]; . == "oncall")) | .name' users.json
```
```
carol
```

And to find the elements where a field is missing or null:

```sh
jq -r '.items[] | select(.last_login == null) | .name' users.json
```
```
bob
```

## Mapping and picking fields

`.items[]` outputs each element separately, while `map` keeps the result as an
array. Which one to use depends on what comes next:

```sh
jq -r '.items[] | .name' users.json
```
```
alice
bob
carol
dave
```

```sh
jq -c '.items | map({name, team})' users.json
```
```
[{"name":"alice","team":"payments"},{"name":"bob","team":"search"},{"name":"carol","team":"payments"},{"name":"dave","team":"search"}]
```

To get something I can paste in a spreadsheet or pipe to `sort` / `awk`, `@tsv`
(or `@csv`) is very convenient:

```sh
jq -r '.items[] | [.id, .name, .team] | @tsv' users.json
```
```
101	alice	payments
102	bob	search
103	carol	payments
104	dave	search
```

String interpolation uses `\(...)`, and `//` gives a default value when the
left side is null:

```sh
jq -r '.items[] | "\(.name) last logged in: \(.last_login // "never")"' users.json
```
```
alice last logged in: 2025-05-20T09:12:00Z
bob last logged in: never
carol last logged in: 2025-05-24T17:45:00Z
dave last logged in: 2025-05-23T08:01:00Z
```

## Array operations

Sorting (nulls come first, so `reverse` puts them at the end):

```sh
jq -c '.items | sort_by(.last_login) | reverse | map(.name)' users.json
```
```
["carol","dave","alice","bob"]
```

Grouping and counting. This is the one I look up the most:

```sh
jq -c '.items | group_by(.team) | map({team: .[0].team, count: length})' users.json
```
```
[{"team":"payments","count":2},{"team":"search","count":2}]
```

Flattening nested arrays and removing duplicates:

```sh
jq -c '[.items[].roles[]] | unique' users.json
```
```
["admin","dev","oncall"]
```

Turning an array into a lookup object, e.g. name to team:

```sh
jq -c '.items | map({(.name): .team}) | add' users.json
```
```
{"alice":"payments","bob":"search","carol":"payments","dave":"search"}
```

And `min_by` / `max_by` to get a single element:

```sh
jq '.items | max_by(.last_login) | .name' users.json
```
```
"carol"
```

## Transforming

The update operator `|=` modifies part of the document and keeps the rest. For
example, only keep the active users, but still return the whole response with
an updated `total`:

```sh
jq -c '.items |= map(select(.active)) | .total = (.items | length) | {total, names: [.items[].name]}' users.json
```
```
{"total":3,"names":["alice","carol","dave"]}
```

(The last `{total, names: ...}` is only there to make the output shorter.)

`del` removes fields, which is useful to get rid of the noise in big responses:

```sh
jq -c 'del(.items[].roles) | .items[0]' users.json
```
```
{"id":101,"name":"alice","team":"payments","active":true,"last_login":"2025-05-20T09:12:00Z"}
```

`|=` also works inside `map` to change a single field:

```sh
jq -c '.items | map(.name |= ascii_upcase) | map(.name)' users.json
```
```
["ALICE","BOB","CAROL","DAVE"]
```

To change the keys of an object, `with_entries` gives you each `key` / `value`
pair. For example, with this config in `env.json`:

```json
{"HOST": "localhost", "PORT": 8080, "DEBUG": true}
```

Lowercase the keys and convert the values to strings:

```sh
jq 'with_entries(.key |= ascii_downcase | .value |= tostring)' env.json
```
```json
{
  "host": "localhost",
  "port": "8080",
  "debug": "true"
}
```

## Searching deeply nested JSON

When I don't know where a field is in a big response, `..` goes through every
value recursively. Combined with `objects` and `has`, it finds a field
wherever it is:

```sh
jq -r '.. | objects | select(has("team")) | .team' users.json | sort -u
```
```
payments
search
```

## Using jq in scripts

Pass shell variables with `--arg` rather than building the filter with string
concatenation, which avoids quoting issues:

```sh
jq -r --arg team search '.items[] | select(.team == $team) | .name' users.json
```
```
bob
dave
```

And `-e` sets the exit status based on the output, which is useful in `if`
statements. It returns a non-zero code when nothing matched (4 here):

```sh
jq -e '.items[] | select(.name == "zoe")' users.json > /dev/null; echo $?
```
```
4
```

## References

* [The jq manual](https://jqlang.org/manual/), which has an example for almost
  every function.
* [The jq playground](https://play.jqlang.org/), to try filters in the browser
  without a terminal.
