require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'fileutils'
require 'uri'
require 'jekyll'

class DatasetMetadataTest < Minitest::Test
  ROOT = File.expand_path('..', __dir__)
  CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/'
  PAPER = 'https://proceedings.mlr.press/v70/deng17a.html'

  def self.rendered_pages
    @rendered_pages ||= Dir.mktmpdir('dataset-metadata-') do |temporary|
      source = File.join(temporary, 'source')
      output = File.join(temporary, 'output')
      FileUtils.mkdir_p(File.join(source, 'wildchat'))
      %w[_includes _layouts _data].each { |path| FileUtils.cp_r(File.join(ROOT, path), source) }
      %w[index.html wildchat/index.html].each do |path|
        FileUtils.cp(File.join(ROOT, path), File.join(source, path))
      end
      config = Jekyll.configuration(
        'source' => source, 'destination' => output,
        'url' => 'https://yuntiandeng.com', 'baseurl' => '',
        'title' => 'Yuntian Deng', 'description' => 'Research website',
        'quiet' => true, 'disable_disk_cache' => true
      )
      Jekyll::Site.new(config).process
      %w[index.html wildchat/index.html].to_h do |path|
        [path, File.read(File.join(output, path))]
      end
    end
  end

  def documents(html)
    html.scan(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/m).map do |match|
      JSON.parse(match.first)
    end
  end

  def objects(value)
    case value
    when Hash then [value] + value.values.flat_map { |child| objects(child) }
    when Array then value.flat_map { |child| objects(child) }
    else []
    end
  end

  def url?(value)
    return false unless value.is_a?(String)
    uri = URI.parse(value)
    %w[http https].include?(uri.scheme) && !uri.host.to_s.empty?
  rescue URI::InvalidURIError
    false
  end

  def google_dataset_citation?(value)
    return !value.strip.empty? if value.is_a?(String)
    value.is_a?(Hash) &&
      Array(value['@type']).include?('CreativeWork') &&
      url?(value['url'])
  end

  def creator?(value)
    value.is_a?(Hash) &&
      (Array(value['@type']) & %w[Person Organization]).any? &&
      value['name'].is_a?(String) && !value['name'].strip.empty?
  end

  def test_all_rendered_datasets_have_creators_licenses_and_supported_citations
    datasets = self.class.rendered_pages.values.flat_map do |html|
      documents(html).flat_map { |document| objects(document) }
    end.select { |item| Array(item['@type']).include?('Dataset') }
    assert_operator datasets.length, :>=, 2
    datasets.each do |dataset|
      creators = dataset['creator'].is_a?(Array) ? dataset['creator'] : [dataset['creator']]
      refute_empty creators, "Missing creator: #{dataset['name']}"
      creators.each { |creator| assert creator?(creator), "Missing or invalid creator: #{dataset['name']}" }
      assert url?(dataset['license']), "Missing or invalid license: #{dataset['name']}"
      assert_operator dataset.fetch('description').length, :>=, 50
      next unless dataset.key?('citation')
      citations = dataset['citation'].is_a?(Array) ? dataset['citation'] : [dataset['citation']]
      refute_empty citations
      citations.each { |citation| assert google_dataset_citation?(citation), "Unsupported Google Dataset citation: #{dataset['name']}" }
    end
  end

  def test_wildchat_releases_keep_all_six_creators
    dataset = documents(self.class.rendered_pages.fetch('wildchat/index.html')).find { |item| item['@type'] == 'Dataset' }
    releases = dataset.fetch('hasPart')
    assert_equal ['WildChat-4.8M', 'WildChat-4.8M-Full'], releases.map { |release| release['name'] }
    expected = ['Wenting Zhao', 'Xiang Ren', 'Jack Hessel', 'Claire Cardie', 'Yejin Choi', 'Yuntian Deng']
    ([dataset] + releases).each do |item|
      assert_equal expected, item.fetch('creator', []).map { |creator| creator['name'] }, "Incorrect creators: #{item['name']}"
    end
  end

  def test_wildchat_uses_a_citation_url_and_preserves_the_paper
    dataset = documents(self.class.rendered_pages.fetch('wildchat/index.html')).find { |item| item['@type'] == 'Dataset' }
    paper_url = 'https://proceedings.iclr.cc/paper_files/paper/2024/hash/9421261e06f1a63a352b068f1ac90609-Abstract-Conference.html'
    assert_equal paper_url, dataset['citation']
    paper = dataset.fetch('subjectOf')
    assert_equal 'ScholarlyArticle', paper['@type']
    assert_equal paper_url, paper['url']
    assert_equal 'WildChat: 1M ChatGPT Interaction Logs in the Wild', paper['name']
    assert_equal '2024', paper['datePublished']
    assert_equal ['Wenting Zhao', 'Xiang Ren', 'Jack Hessel', 'Claire Cardie', 'Yejin Choi', 'Yuntian Deng'], paper['author'].map { |author| author['name'] }
  end

  def test_im2latex_keeps_its_paper_and_creator_attribution
    graph = documents(self.class.rendered_pages.fetch('index.html')).first.fetch('@graph')
    dataset = graph.find { |item| item['@type'] == 'Dataset' }
    assert_equal CC0, dataset['license']
    assert_equal PAPER, dataset['citation']
    assert_equal ['Yuntian Deng', 'Anssi Kanervisto', 'Alexander M. Rush'], dataset['creator'].map { |author| author['name'] }
    paper = graph.find { |item| item['@id'] == dataset.dig('subjectOf', '@id') }
    assert_equal 'ScholarlyArticle', paper['@type']
    assert_equal PAPER, paper['url']
    assert_equal 4, paper['author'].length
  end

  def test_google_dataset_citation_profile
    refute google_dataset_citation?({'@id' => 'https://im2markup.yuntiandeng.com/#paper'})
    assert google_dataset_citation?(PAPER)
    assert google_dataset_citation?({'@type' => 'CreativeWork', 'url' => PAPER})
    refute google_dataset_citation?({'@type' => 'ScholarlyArticle', 'url' => PAPER})
    refute url?(nil)
    refute url?('CC0')
  end
end
