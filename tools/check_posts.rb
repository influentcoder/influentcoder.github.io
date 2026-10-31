#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Validate the front matter of every post in _posts/.
#
# Usage: ruby tools/check_posts.rb [FILE...]

require "date"
require "yaml"

Encoding.default_external = Encoding::UTF_8

FILENAME = /\A(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md\z/
TAG = /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/
DESCRIPTION_LENGTH = (50..200)

def check(path)
  errors = []
  name = File.basename(path)
  match = FILENAME.match(name)
  errors << "filename must look like YYYY-MM-DD-lowercase-slug.md" unless match

  src = File.read(path)
  fm = src[/\A---\n(.*?)\n---\n/m, 1]
  return errors << "missing front matter block" unless fm

  begin
    data = YAML.safe_load(fm, permitted_classes: [Date, Time]) || {}
  rescue Psych::Exception => e
    return errors << "front matter is not valid YAML: #{e.message}"
  end

  errors << "replace the CHANGE-ME placeholders from tools/new_post.rb" if fm.match?(/change[ -]me/i)

  title = data["title"]
  errors << "title is required" unless title.is_a?(String) && !title.strip.empty?

  date = data["date"]
  date_str = date.is_a?(Time) || date.is_a?(Date) ? date.strftime("%Y-%m-%d") : date.to_s[0, 10]
  if date.nil?
    errors << "date is required"
  elsif match && date_str != match[1]
    errors << "date (#{date_str}) does not match the filename date (#{match[1]})"
  end

  errors << "categories is required" if data["categories"].to_s.strip.empty?

  desc = data["description"]
  if !desc.is_a?(String) || desc.strip.empty?
    errors << "description is required"
  elsif !DESCRIPTION_LENGTH.cover?(desc.strip.length)
    errors << "description must be #{DESCRIPTION_LENGTH.min}-#{DESCRIPTION_LENGTH.max} characters (is #{desc.strip.length})"
  end

  tags = data["tags"]
  if !tags.is_a?(Array) || tags.empty?
    errors << "tags must be a non-empty list, e.g. tags: [linux, filesystems]"
  else
    bad = tags.reject { |t| t.is_a?(String) && TAG.match?(t) }
    errors << "tags must be lowercase-hyphenated: #{bad.join(', ')}" unless bad.empty?
  end

  errors
end

files = ARGV.empty? ? Dir["_posts/*"].sort : ARGV
failed = 0
files.each do |path|
  errors = check(path)
  next if errors.empty?

  failed += 1
  errors.each { |e| warn "#{path}: #{e}" }
end

if failed.positive?
  warn "\n#{failed} of #{files.size} posts have front matter errors."
  exit 1
end
puts "Front matter OK (#{files.size} posts)."
