---
layout: page
title: Recent Papers
permalink: /papers/
---



{% for paper in site.data.papers %}

<a class="paper" href="{{paper.pdf}}">
{{paper.title}}
</a><br>
{{paper.authors}}.<br>
{{paper.conference}} <br>
{% if paper.pdf %}<a class="icon pdf label label-info" href="{{paper.pdf}}">pdf</a> {% endif %}
{% if paper.image %}<img src="{{paper.img}}"> {% endif %}
{% if paper.slides %}<a class="icon slides label label-success" href="{{paper.slides}}">slides</a>{% endif %}
{% if paper.code %} <a class="icon slides label label-success label-warning" href="{{paper.code}}">code</a>{% endif %}
<br>



{% endfor %}