#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Flag writing patterns that make posts read as machine-generated: emoji or
# bold or numbered headings, paper-style sections, stock phrases, heavy bold
# and em-dash use, and broken code fences. See .claude/skills/edit-post/.
#
# Usage: ruby tools/check_prose.rb [--strict] [--quiet] [FILE...]
#   Warnings only by default; --strict exits 1 if anything is found (this is
#   what `make prose` and `make check` use); --quiet prints only the totals.

Encoding.default_external = Encoding::UTF_8

EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/
SCAFFOLD_HEADINGS = /\A(abstract|introduction|methodology|conclusion|summary|final thoughts|closing thoughts|key takeaways|wrapping up|tl;?dr)\z/i
STOCK_PHRASES = Regexp.union(
  /\bdelv(e|es|ed|ing)\b/i, /\b(ever|rapidly)[- ]evolving\b/i, /\blandscape\b/i,
  /\bcrucial\b/i, /\bseamless(ly)?\b/i, /\brobust\b/i, /\bleverag(e|es|ed|ing)\b/i,
  /\bcomprehensive\b/i, /\bin today's\b/i, /\bit'?s (important|worth) (to note|noting)\b/i,
  /\bgame[- ]changer\b/i, /\bunlock(s|ed|ing)?\b/i, /\bempower(s|ed|ing)?\b/i,
  /\blet'?s (dive|delve)\b/i, /\bdeep dive\b/i, /\bwhether you'?re\b/i,
  /\bplays? an? (key|vital|crucial|pivotal) role\b/i, /\bpivotal\b/i, /\btestament to\b/i,
  /\bnavigat(e|ing) the complexit/i, /\btapestry\b/i, /\bharness(es|ed|ing)?\b/i,
  /\bin (conclusion|summary)\b/i, /\bat its core\b/i, /\bembark/i, /\bcutting[- ]edge\b/i,
  /\bindispensable\b/i, /\bbackbone\b/i, /\bmyriad\b/i, /\bplethora\b/i, /\bstreamlin(e|es|ed|ing)\b/i
)
MAX_BOLD = 5      # **bold** spans per post
MAX_EM_DASHES = 3 # per post
MAX_RULES = 1     # "---" separators per post

def check(path)
  issues = []
  in_code = false
  bold = em = rules = 0
  body_start = File.read(path).lines.each_with_index.select { |l, _| l.start_with?("---") && l.strip == "---" }[1]&.last.to_i

  File.readlines(path).each_with_index do |line, idx|
    n = idx + 1
    next if n <= body_start + 1 && !line.start_with?("  ") # front matter, except the indented description

    if line.start_with?("```")
      issues << [n, "broken-fence", "code fence and code on one line"] if line.strip.match?(/\A```\w*\s+\S.*```\z/)
      in_code = !in_code
      next
    end
    next if in_code

    text = line.chomp
    issues << [n, "broken-fence", "\"#{text.strip}\" is not a code fence; use ``` instead"] if text.match?(/\A---[a-z]+\s*\z/i)

    if text.start_with?("#")
      issues << [n, "emoji-heading", "heading contains an emoji"] if text.match?(EMOJI)
      issues << [n, "bold-heading", "heading is wrapped in **bold**"] if text.match?(/\A#+\s+\*\*/)
      issues << [n, "numbered-heading", "heading is numbered"] if text.match?(/\A#+\s+(\*\*)?\d+(\.\d+)*\.?\s/)
      bare = text.sub(/\A#+\s+/, "").gsub(/\*\*|#{EMOJI}/o, "").sub(/\A\d+(\.\d+)*\.?\s*/, "").strip
      issues << [n, "scaffold-heading", "\"#{bare}\" section: paper-style structure"] if bare.match?(SCAFFOLD_HEADINGS)
    end

    rules += 1 if n > body_start + 1 && text.strip == "---"
    bold += text.scan(/\*\*[^*]+\*\*/).size
    em += text.count("—")
    text.scan(STOCK_PHRASES) { issues << [n, "stock-phrase", "\"#{Regexp.last_match[0]}\""] }
  end

  issues << [0, "bold-density", "#{bold} bold spans (max #{MAX_BOLD}); keep bold for real warnings"] if bold > MAX_BOLD
  issues << [0, "em-dash", "#{em} em-dashes (max #{MAX_EM_DASHES}); use commas, brackets or \" - \""] if em > MAX_EM_DASHES
  issues << [0, "section-rules", "#{rules} \"---\" separators (max #{MAX_RULES}); headings already separate sections"] if rules > MAX_RULES
  issues
end

strict = ARGV.delete("--strict")
quiet = ARGV.delete("--quiet")
files = ARGV.empty? ? Dir["_posts/*.md"].sort : ARGV
total = 0
summary = files.map do |path|
  issues = check(path)
  issues.sort_by(&:first).each { |n, rule, msg| warn "#{path}:#{n}: [#{rule}] #{msg}" } unless quiet
  total += issues.size
  [File.basename(path), issues.size]
end

puts "\nProse warnings per post:"
summary.each { |name, count| puts format("  %-50s %3d", name, count) }
puts "  Total: #{total}"
exit 1 if strict && total.positive?
