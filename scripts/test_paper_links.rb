require 'minitest/autorun'
require 'yaml'
require 'json'
require 'uri'

class PaperLinksTest < Minitest::Test
  ROOT = File.expand_path('..', __dir__)
  IDENTIFIER = '(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?'

  def data(path)
    YAML.safe_load(File.read(File.join(ROOT, path)))
  end

  def arxiv?(url)
    return false if url.to_s.include?('{{')
    URI.parse(url.to_s).host.to_s.match?(/(?:\A|\.)arxiv\.org\z/)
  end

  def identifier(url, role)
    match = url.to_s.match(%r{\Ahttps://arxiv\.org/#{role}/(#{IDENTIFIER})\z})
    match && match[1]
  end

  def papers
    data('_data/papers.yaml').values.flatten
  end

  def test_arxiv_paper_links_are_abstract_pages_with_matching_pdfs
    papers.each do |paper|
      refute paper.key?('pdf'), "Ambiguous legacy field: #{paper['title']}"
      next unless arxiv?(paper['paper_url'])

      id = identifier(paper['paper_url'], 'abs')
      refute_nil id, "Expected abstract URL: #{paper['paper_url']}"
      assert_equal id, identifier(paper['pdf_url'], 'pdf'), paper['title']
      next unless paper['html_url']

      html_id = identifier(paper['html_url'], 'html')
      refute_nil html_id, "Invalid HTML URL: #{paper['html_url']}"
      assert_equal id.sub(/v\d+\z/, ''), html_id.sub(/v\d+\z/, '')
    end
  end

  def test_link_roles_reject_redirects_and_wrong_formats
    assert_equal '2311.01460', identifier('https://arxiv.org/abs/2311.01460', 'abs')
    assert_equal '2311.01460v1', identifier('https://arxiv.org/pdf/2311.01460v1', 'pdf')
    assert_equal 'cs/9901001v2', identifier('https://arxiv.org/abs/cs/9901001v2', 'abs')
    assert_nil identifier('https://arxiv.org/pdf/2311.01460.pdf', 'pdf')
    assert_nil identifier('https://arxiv.org/pdf/2311.01460', 'abs')
    assert_nil identifier('http://arxiv.org/abs/2311.01460', 'abs')
    assert_nil identifier('https://arxiv.org/abs/2311.01460?download=1', 'abs')
  end

  def test_theme_and_demo_paper_links_use_abstract_pages
    links = data('_data/research_themes.yml').flat_map { |theme| theme.fetch('links', []).map { |link| link['url'] } }
    links += data('_data/demos.yaml').fetch('demos').map { |demo| demo['paper'] }
    links.each do |url|
      assert identifier(url, 'abs'), "Expected abstract URL: #{url}" if arxiv?(url)
    end
  end

  def test_inline_arxiv_pdf_links_are_labeled_or_version_specific
    content = %w[index.html papers.html cs886-topics-in-language-models.html].map { |path| File.read(File.join(ROOT, path)) }
    content += JSON.parse(File.read(File.join(ROOT, '_data/news.json'))).map { |item| item['content'] }
    content += papers.map { |paper| paper['notes'].to_s }
    content.join("\n").scan(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/m).each do |url, label|
      next unless arxiv?(url)
      refute_match(/\.pdf(?:[#?]|\z)/, url)
      next unless URI.parse(url).path.start_with?('/pdf/')
      next if URI.parse(url).path.match?(/v\d+\z/)

      assert_match(/\bPDF\b/i, label, "Unlabeled PDF link: #{url}")
    end
  end

  def test_templates_keep_primary_and_full_text_links_separate
    %w[index.html papers.html].each do |path|
      source = File.read(File.join(ROOT, path))
      refute_match(/paper\.pdf\b/, source)
      assert_match(/class="paper" href="\{\{paper\.paper_url\}\}"/, source)
      assert_match(/href="\{\{ paper\.pdf_url \| escape \}\}">PDF<\/a>/, source)
      assert_match(/href="\{\{ paper\.html_url \| escape \}\}">HTML<\/a>/, source)
    end
  end

  def test_original_source_versions_are_preserved
    releases = File.read(File.join(ROOT, '_data/wildchat/releases.json'))
    assert_includes releases, 'https://arxiv.org/html/2405.01470v1#S2'
    assert_includes releases, 'https://arxiv.org/html/2405.01470v1#S6'
    assert_includes File.read(File.join(ROOT, 'wildchat/releases.html')), 'https://arxiv.org/html/2405.01470v1'
  end

  def test_non_arxiv_files_and_publisher_links_remain_available
    urls = papers.map { |paper| paper['paper_url'] }
    assert_includes urls, '/papers/Deng2019ICDAR.pdf'
    assert_includes urls, 'https://aclanthology.org/P17-4012.pdf'
    assert_includes urls, 'https://openreview.net/pdf?id=d0zla3M3LI'
  end

  def test_tests_are_not_published_as_site_content
    assert_includes data('_config.yml').fetch('exclude'), 'scripts/'
  end
end
