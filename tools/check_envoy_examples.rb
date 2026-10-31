#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Check the Envoy configs in the Envoy post.
#
# YAML blocks that start with "admin:" are complete configs: they are written
# to OUT_DIR so `make envoy-examples` can run `envoy --mode validate` on them.
# Every other YAML block is an excerpt and must appear, line for line (at any
# indentation), in one of the complete configs, so excerpts can't drift from
# the configs that were validated.
#
# Usage: ruby tools/check_envoy_examples.rb [POST] [OUT_DIR]

require "fileutils"

Encoding.default_external = Encoding::UTF_8

post = ARGV[0] || "_posts/2025-06-01-envoy.md"
out_dir = ARGV[1]

blocks = File.read(post).scan(/^```yaml\n(.*?)^```$/m).map { |(b)| b.lines.map(&:rstrip) }
configs, excerpts = blocks.partition { |lines| lines.first&.start_with?("admin:") }
abort "#{post}: no complete Envoy config (a yaml block starting with admin:)" if configs.empty?

def indent(line) = line[/\A */].size

def excerpt_of?(excerpt, config)
  base = indent(excerpt.first)
  config.each_index.any? do |i|
    offset = indent(config[i]) - base
    next false if offset.negative?

    excerpt.each_with_index.all? do |line, k|
      config[i + k] == (line.empty? ? "" : (" " * offset) + line)
    end
  end
end

failed = excerpts.reject { |e| configs.any? { |c| excerpt_of?(e, c) } }
failed.each { |e| warn "#{post}: excerpt not found in any full config:\n#{e.first(3).join("\n")}\n..." }

if out_dir
  FileUtils.mkdir_p(out_dir)
  configs.each_with_index { |c, i| File.write(File.join(out_dir, "config-#{i + 1}.yaml"), c.join("\n") + "\n") }
end

exit 1 unless failed.empty?
puts "#{post}: #{configs.size} full configs, #{excerpts.size} excerpts match"
