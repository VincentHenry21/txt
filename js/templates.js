/* TXTTemplates: starter document templates. window.TXTTemplates = [{id, icon, nameKey, descKey, html}] */
(function (root) {
  var T = [
    {
      id: "blank", icon: "+", nameKey: "tplBlank", descKey: "tplBlankD",
      html: "<p><br></p>"
    },
    {
      id: "resume", icon: "R", nameKey: "tplResume", descKey: "tplResumeD",
      html:
        '<h1 style="text-align:center">Your Name</h1>' +
        '<p style="text-align:center">City, Country · phone · email · linkedin.com/in/you</p><hr>' +
        "<h2>Summary</h2>" +
        "<p>Two or three sentences about who you are and what you do best.</p>" +
        "<h2>Experience</h2>" +
        "<p><strong>Job Title</strong> — Company Name<br><em>2023 – Present</em></p>" +
        "<ul><li>Accomplishment with numbers, e.g. grew sales by 30%.</li><li>Another result-focused bullet.</li></ul>" +
        "<p><strong>Job Title</strong> — Company Name<br><em>2021 – 2023</em></p>" +
        "<ul><li>What you owned and what changed because of it.</li></ul>" +
        "<h2>Education</h2>" +
        "<p><strong>Degree</strong> — University Name, Year</p>" +
        "<h2>Skills</h2>" +
        "<p>Skill one · Skill two · Skill three · Skill four</p>"
    },
    {
      id: "cover", icon: "C", nameKey: "tplCover", descKey: "tplCoverD",
      html:
        "<p>Your Name<br>Street Address<br>City, Postal Code<br>Phone · Email</p>" +
        "<p>15 October 2026</p>" +
        "<p>Hiring Manager<br>Company Name<br>Street Address<br>City, Postal Code</p>" +
        "<p>Dear Hiring Manager,</p>" +
        "<p>I am writing to apply for the <strong>[Position Title]</strong> role at <strong>[Company Name]</strong>. With my background in [your field], I am excited by the opportunity to contribute to [something specific about the company].</p>" +
        "<p>In my previous role at [Company], I [key achievement with numbers]. I bring [skill 1], [skill 2], and [skill 3], which align directly with what your team needs.</p>" +
        "<p>I would welcome the chance to discuss how I can help [Company Name] reach its goals. Thank you for your time and consideration.</p>" +
        "<p>Sincerely,<br><br>Your Name</p>"
    },
    {
      id: "report", icon: "B", nameKey: "tplReport", descKey: "tplReportD",
      html:
        '<h1 style="text-align:center">Business Report</h1>' +
        '<p style="text-align:center"><em>Prepared by: Your Name · 15 October 2026</em></p><hr>' +
        "<h2>Executive Summary</h2>" +
        "<p>Summarize the key findings and recommendations in three to five sentences.</p>" +
        "<h2>Background</h2>" +
        "<p>Why this report exists and what question it answers.</p>" +
        "<h2>Findings</h2>" +
        '<table class="txt-table"><tbody><tr><th>Metric</th><th>Q2</th><th>Q3</th><th>Change</th></tr>' +
        "<tr><td>Revenue</td><td></td><td></td><td></td></tr>" +
        "<tr><td>Customers</td><td></td><td></td><td></td></tr>" +
        "<tr><td>Satisfaction</td><td></td><td></td><td></td></tr></tbody></table>" +
        "<h2>Recommendations</h2>" +
        "<ol><li>First recommended action.</li><li>Second recommended action.</li><li>Third recommended action.</li></ol>" +
        "<h2>Conclusion</h2><p>Closing paragraph.</p>"
    },
    {
      id: "essay", icon: "E", nameKey: "tplEssay", descKey: "tplEssayD",
      html:
        '<h1 style="text-align:center">Essay Title</h1>' +
        '<p style="text-align:center">Your Name · Class · Date</p><hr>' +
        "<h2>Introduction</h2>" +
        "<p>Hook the reader, give background, and state your thesis clearly in the final sentence of this paragraph.</p>" +
        "<h2>Body Paragraph 1</h2>" +
        "<p>Topic sentence, evidence, explanation, and a link back to the thesis.</p>" +
        "<h2>Body Paragraph 2</h2>" +
        "<p>Topic sentence, evidence, explanation, and a link back to the thesis.</p>" +
        "<h2>Body Paragraph 3</h2>" +
        "<p>Address a counterpoint, then refute it with evidence.</p>" +
        "<h2>Conclusion</h2>" +
        "<p>Restate the thesis in new words, summarize the argument, and end with a final thought.</p>"
    },
    {
      id: "meeting", icon: "M", nameKey: "tplMeeting", descKey: "tplMeetingD",
      html:
        "<h1>Meeting Notes</h1>" +
        "<p><strong>Date:</strong> 15 October 2026<br><strong>Attendees:</strong> </p>" +
        "<h2>Agenda</h2><ol><li></li><li></li></ol>" +
        "<h2>Discussion</h2><p></p>" +
        "<h2>Decisions</h2><ul><li></li></ul>" +
        "<h2>Action Items</h2>" +
        '<table class="txt-table"><tbody><tr><th>Task</th><th>Owner</th><th>Due</th><th>Done</th></tr>' +
        "<tr><td></td><td></td><td></td><td>☐</td></tr>" +
        "<tr><td></td><td></td><td></td><td>☐</td></tr>" +
        "<tr><td></td><td></td><td></td><td>☐</td></tr></tbody></table>"
    },
    {
      id: "research", icon: "P", nameKey: "tplResearch", descKey: "tplResearchD",
      html:
        '<h1 style="text-align:center">Research Paper Title</h1>' +
        '<p style="text-align:center">Your Name<br>Affiliation<br>15 October 2026</p><hr>' +
        "<h2>Abstract</h2>" +
        "<p>Summarize the research question, method, key results, and conclusion in about 150 words.</p>" +
        "<h2>Introduction</h2><p></p>" +
        "<h2>Literature Review</h2><p></p>" +
        "<h2>Methodology</h2><p></p>" +
        "<h2>Results</h2><p></p>" +
        "<h2>Discussion</h2><p></p>" +
        "<h2>Conclusion</h2><p></p>" +
        "<h2>References</h2><p>Use Insert, References, Cite to add sources, then insert the bibliography here.</p>"
    },
    {
      id: "newsletter", icon: "N", nameKey: "tplNews", descKey: "tplNewsD",
      html:
        '<h1 style="text-align:center">Newsletter Title</h1>' +
        '<p style="text-align:center"><em>Issue #1 · October 2026</em></p><hr>' +
        "<h2>Headline Story</h2>" +
        "<p>Lead with your biggest news. Keep paragraphs short and scannable.</p>" +
        "<h2>In Case You Missed It</h2>" +
        "<ul><li>Update one with a link.</li><li>Update two with a link.</li><li>Update three with a link.</li></ul>" +
        "<h2>Upcoming</h2><p>What is happening next, with dates.</p>" +
        "<blockquote>Pull a strong quote from the story above.</blockquote>" +
        "<p><em>Thanks for reading. Reply to this email with your thoughts.</em></p>"
    }
  ];
  root.TXTTemplates = T;
})(typeof self !== "undefined" ? self : this);
