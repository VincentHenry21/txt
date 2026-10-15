/* TXT templates: 6 rich starters + the flagship showcase document. */
(function () {
  "use strict";
  var T = window.TXT;

  var SHOWCASE = '' +
    '<h1>Q4 Product Architecture and Executive Strategy</h1>' +
    '<div class="callout info"><div><strong>Document brief.</strong> Prepared by the Product Architecture group. ' +
    'Status: Draft for executive review. Last updated October 2026. ' +
    'Read time about 6 minutes.</div></div>' +
    '<h2>Executive Summary</h2>' +
    '<p>TXT is a flagship word processor that pairs the typographic power of a desktop publishing suite ' +
    'with the speed of a modern writing app. This document exercises every major surface: paginated sheets, ' +
    'tables, checklists, code blocks, footnotes, and the review workflow.</p>' +
    '<h3>Key metrics</h3>' +
    '<table class="txt-table"><tr><th>Metric</th><th>Q3</th><th>Q4 target</th><th>Owner</th></tr>' +
    '<tr><td>Weekly active writers</td><td>12,400</td><td>20,000</td><td>Growth</td></tr>' +
    '<tr><td>Median session length</td><td>24 min</td><td>35 min</td><td>Product</td></tr>' +
    '<tr><td>Export success rate</td><td>98.1%</td><td>99.5%</td><td>Platform</td></tr>' +
    '<tr><td>Crash-free sessions</td><td>99.2%</td><td>99.8%</td><td>Platform</td></tr></table>' +
    '<h2>Launch Checklist</h2>' +
    '<ul><li class="task"><input type="checkbox" checked> Finalize pagination engine</li>' +
    '<li class="task"><input type="checkbox" checked> Ship 9-tab smart ribbon</li>' +
    '<li class="task"><input type="checkbox"> Verify DOCX export fidelity</li>' +
    '<li class="task"><input type="checkbox"> iPad ink annotation pass</li></ul>' +
    '<h3>Pagination note</h3>' +
    '<p>The canvas renders virtual paginated sheets. Rulers, margins, and the page indicator ' +
    'all track the active sheet in real time.<span class="fnref" data-fn="1">[1]</span></p>' +
    '<h2>Export Pipeline</h2>' +
    '<pre class="codeblock">async function exportDocument(format) {\n' +
    '  const html = editor.serialize();\n' +
    '  const blob = await converters[format](html);\n' +
    '  download(blob, `document.${format}`);\n}<button type="button" class="copy-code">Copy</button></pre>' +
    '<div class="fn-tray"><div><span class="fnref">[1]</span> Virtual pagination keeps a single ' +
    'editable surface while page frames render behind it, which keeps caret behavior reliable.</div></div>';

  var TEMPLATES = [
    {
      id: "blank", name: "Blank Document", desc: "A clean sheet. Start writing immediately.", icon: "i-page",
      title: "Untitled document",
      html: "<p><br></p>"
    },
    {
      id: "executive", name: "Executive Strategy Report", desc: "Board-ready structure with metrics and decisions.", icon: "i-stats",
      title: "Executive Strategy Report",
      html:
        '<h1>Executive Strategy Report</h1>' +
        '<p><em>Confidential. Prepared for the leadership team.</em></p>' +
        '<div class="callout warn"><div><strong>Decision needed:</strong> Approve Q1 resourcing for the platform track by Friday.</div></div>' +
        '<h2>1. Situation</h2><p>Summarize the current state in two sentences. Anchor on facts, not adjectives.</p>' +
        '<h2>2. Options considered</h2><table class="txt-table"><tr><th>Option</th><th>Cost</th><th>Risk</th></tr>' +
        '<tr><td>Accelerate</td><td>High</td><td>Medium</td></tr><tr><td>Steady</td><td>Medium</td><td>Low</td></tr></table>' +
        '<h2>3. Recommendation</h2><p>State the recommendation and the single strongest reason.</p>' +
        '<h2>4. Ask</h2><ul><li class="task"><input type="checkbox"> Approve budget</li><li class="task"><input type="checkbox"> Confirm owner</li></ul>'
    },
    {
      id: "academic", name: "IEEE/APA Academic Paper", desc: "Two-column ready paper with abstract and references.", icon: "i-book",
      title: "Academic Research Paper",
      html:
        '<h1>On Efficient Document Layout Engines</h1>' +
        '<p style="text-align:center"><em>A. Researcher, Department of Computer Science</em></p>' +
        '<h2>Abstract</h2><p>This paper studies virtual pagination for browser-based word processors. ' +
        'We show that a single editable surface with rendered page frames matches user expectations ' +
        'while keeping caret behavior reliable.</p>' +
        '<h2>1. Introduction</h2><p>Browser editing surfaces have matured, yet pagination remains difficult.<span class="fnref" data-fn="1">[1]</span></p>' +
        '<h2>2. Method</h2><p>We measure layout cost across document sizes and compare frame-overlay against DOM-per-page approaches.</p>' +
        '<h2>References</h2><p class="bib-entry">Researcher, A. (2026). Efficient layout for editing surfaces. <em>Journal of Document Engineering, 14</em>(2), 41-58.</p>' +
        '<div class="fn-tray"><div><span class="fnref">[1]</span> See section 2 for measurement details.</div></div>'
    },
    {
      id: "prd", name: "Modern Software PRD", desc: "Problem, goals, scope, and milestones for a product build.", icon: "i-file",
      title: "Product Requirements Document",
      html:
        '<h1>PRD: TXT Flagship Rebuild</h1>' +
        '<div class="callout info"><div><strong>Status:</strong> In build. <strong>Owner:</strong> Product. <strong>Target:</strong> v4.0</div></div>' +
        '<h2>Problem</h2><p>Writers need desktop-class pagination with modern app speed.</p>' +
        '<h2>Goals</h2><ul><li class="task"><input type="checkbox" checked> Zero dead buttons</li>' +
        '<li class="task"><input type="checkbox"> Sub-100ms command latency</li>' +
        '<li class="task"><input type="checkbox"> WCAG AAA contrast mode</li></ul>' +
        '<h2>Non-goals</h2><p>Real-time collaboration and cloud sync are out of scope for v4.</p>' +
        '<h2>Milestones</h2><table class="txt-table"><tr><th>Milestone</th><th>Date</th></tr>' +
        '<tr><td>Shell + themes</td><td>Week 1</td></tr><tr><td>Ribbon + canvas</td><td>Week 2</td></tr><tr><td>QA + ship</td><td>Week 3</td></tr></table>'
    },
    {
      id: "brief", name: "Creative Brief", desc: "Audience, message, and deliverables for a campaign.", icon: "i-shapes",
      title: "Creative Brief",
      html:
        '<h1>Creative Brief: Launch Campaign</h1>' +
        '<h2>Objective</h2><p>One sentence: what must the audience do after seeing this?</p>' +
        '<h2>Audience</h2><p>Who they are, what they believe today, and what would change their mind.</p>' +
        '<div class="cmp2"><div><strong>Message A</strong><p>Speed-first positioning.</p></div>' +
        '<div><strong>Message B</strong><p>Craft-first positioning.</p></div></div>' +
        '<h2>Deliverables</h2><ul><li class="task"><input type="checkbox"> Hero visual</li>' +
        '<li class="task"><input type="checkbox"> 15s cutdown</li><li class="task"><input type="checkbox"> Landing page</li></ul>' +
        '<h2>Tone</h2><blockquote>Confident, precise, and quietly ambitious.</blockquote>'
    },
    {
      id: "resume", name: "Minimalist Resume", desc: "Clean single-page resume with experience and skills.", icon: "i-toc",
      title: "Resume",
      html:
        '<h1 style="text-align:center">Alex Morgan</h1>' +
        '<p style="text-align:center">Product Designer. hello@example.com. Yangon, Myanmar</p><hr>' +
        '<h2>Experience</h2><h3>Senior Product Designer, Studio K (2023 to present)</h3>' +
        '<ul><li>Led design system serving 40+ screens</li><li>Cut onboarding drop-off by 31%</li></ul>' +
        '<h3>Product Designer, AppWorks (2021 to 2023)</h3>' +
        '<ul><li>Shipped editor used by 200k writers</li></ul>' +
        '<h2>Skills</h2><p>Interaction design, design systems, prototyping, typography.</p>' +
        '<h2>Education</h2><p>BBA, NMA College (2026)</p>'
    }
  ];

  function showcase() {
    return { title: "Q4 Product Architecture & Executive Strategy.txtdoc", html: SHOWCASE };
  }

  T.templates = { all: TEMPLATES, showcase: showcase };
})();
