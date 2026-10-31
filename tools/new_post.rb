#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Create a new post with the required front matter.
#
# Usage: ruby tools/new_post.rb "Post title" [YYYY-MM-DD]

require "date"

Encoding.default_external = Encoding::UTF_8

title = ARGV[0].to_s.strip
abort "Usage: ruby tools/new_post.rb \"Post title\" [YYYY-MM-DD]" if title.empty?

date = ARGV[1] ? Date.parse(ARGV[1]) : Date.today
slug = title.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
path = "_posts/#{date.strftime('%Y-%m-%d')}-#{slug}.md"
abort "#{path} already exists" if File.exist?(path)

File.write(path, <<~POST)
  ---
  layout: post
  title:  #{title.inspect}
  date:   #{date.strftime('%Y-%m-%d')} 00:00:00 +0800
  categories: CHANGE-ME
  description: >-
    CHANGE ME: one or two sentences (50-200 characters) shown in previews and search results.
  tags: [change-me]
  ---

  Intro paragraph.
POST
puts path
