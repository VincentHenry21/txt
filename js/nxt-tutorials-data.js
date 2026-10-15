/* NXT OS Tutorials data: App -> Tab -> Feature -> steps.
   Only features that really exist in the code are documented here.
   Structure: T.NXT_TUTORIALS[appId] = { name, code, color, desc,
     open: { kind: "app"|"persona", id }, tabs: [ { id, title, tryTab, features: [
     { id, title, steps: [...], tip, tryTab } ] } ] }
   tryTab: optional deeper target used by the "Try it" button. */
(function () {
  "use strict";
  var T = window.TXT;

  var TUTORIALS = {

    /* ================= TXT : flagship word processor ================= */
    txt: {
      name: "TXT", code: "TXT", color: "#7C3AED",
      desc: "Flagship word processor",
      open: { kind: "app", id: "txt" },
      tabs: [
        {
          id: "home", title: "Home tab", tryTab: "home",
          features: [
            {
              id: "txt-bold", title: "Bold, italic and underline",
              steps: [
                "Select the text you want to format in the document.",
                "Open the Home tab in the ribbon.",
                "Click Bold (or press Ctrl+B), Italic (Ctrl+I) or Underline (Ctrl+U).",
                "Click the button again to remove the formatting."
              ],
              tip: "Keyboard shortcuts work even when the ribbon is collapsed."
            },
            {
              id: "txt-font", title: "Change font and size",
              steps: [
                "Select the text to change.",
                "Open the Home tab.",
                "Use the Font dropdown to pick a typeface.",
                "Use the Font Size control, or Grow Font and Shrink Font, to resize.",
                "Use Clear Formatting to strip all styling back to plain text."
              ],
              tip: "Grow Font and Shrink Font step through sizes quickly."
            },
            {
              id: "txt-lists", title: "Bullets, numbers and checklists",
              steps: [
                "Place the caret on a paragraph or select several paragraphs.",
                "Open the Home tab.",
                "Click Bullets for a bulleted list, Numbering for a numbered list, or Checklist for a task list.",
                "Press Enter to add the next item; press Enter twice on an empty item to end the list."
              ],
              tip: "Checklist items are clickable checkboxes in the document."
            },
            {
              id: "txt-align", title: "Align paragraphs",
              steps: [
                "Place the caret anywhere in the paragraph.",
                "Open the Home tab.",
                "Click Align Left, Center, Align Right or Justify.",
                "Use Increase Indent or Decrease Indent to shift the whole paragraph."
              ],
              tip: "Justify gives clean edges on both sides for formal documents."
            },
            {
              id: "txt-painter", title: "Format Painter",
              steps: [
                "Select text that already has the look you want.",
                "Open the Home tab and click Format Painter.",
                "Drag across the target text to apply the same formatting."
              ],
              tip: "The fastest way to copy a heading style onto another heading."
            },
            {
              id: "txt-case", title: "Change case",
              steps: [
                "Select the text.",
                "Open the Home tab and click Change Case.",
                "Pick UPPERCASE, lowercase, or Capitalize Each Word."
              ],
              tip: "Fixes accidentally typed ALL CAPS paragraphs in one click."
            }
          ]
        },
        {
          id: "insert", title: "Insert tab", tryTab: "insert",
          features: [
            {
              id: "txt-table", title: "Insert a table",
              steps: [
                "Place the caret where the table should go.",
                "Open the Insert tab and click Table.",
                "Choose rows and columns, or open Custom table to type exact numbers.",
                "Click inside a cell and type; Tab moves to the next cell.",
                "Use Add row above/below and Add column left/right to grow the table later."
              ],
              tip: "Header row fill colors the top row so it stands out."
            },
            {
              id: "txt-image", title: "Insert an image",
              steps: [
                "Place the caret where the image should appear.",
                "Open the Insert tab and click Image.",
                "Choose a file from your device, or use Image from URL and paste a link.",
                "Add alt text describing the image for accessibility."
              ],
              tip: "Alt text is read aloud by screen readers."
            },
            {
              id: "txt-link", title: "Insert a hyperlink",
              steps: [
                "Select the text that should become the link.",
                "Open the Insert tab and click Link.",
                "Paste the URL and confirm."
              ],
              tip: "Links open in a new tab when readers click them."
            },
            {
              id: "txt-pagenum", title: "Page numbers",
              steps: [
                "Open the Insert tab.",
                "Click Page number and choose the pill style.",
                "The number updates automatically as pages are added."
              ],
              tip: "Required by most school assignment formats."
            },
            {
              id: "txt-cover", title: "Cover page",
              steps: [
                "Open the Insert tab and click Cover page.",
                "Type the document title and subtitle in the dialog.",
                "Confirm to insert the cover at the very start of the document."
              ],
              tip: "Gives assignments a professional front page instantly."
            },
            {
              id: "txt-break", title: "Page breaks",
              steps: [
                "Place the caret where the new page should start.",
                "Open the Insert tab and click Page break.",
                "Content after the caret moves to the next page."
              ],
              tip: "Use a page break before the Bibliography so it always starts fresh."
            }
          ]
        },
        {
          id: "draw", title: "Draw tab", tryTab: "draw",
          features: [
            {
              id: "txt-pen", title: "Draw with pens",
              steps: [
                "Open the Draw tab.",
                "Pick Pen, Fountain Pen or Highlighter.",
                "Draw directly on the page with your finger, stylus or mouse.",
                "Click Exit draw mode when finished to return to typing."
              ],
              tip: "The laser pointer is for presenting, it does not leave ink."
            },
            {
              id: "txt-inkstyle", title: "Ink color and thickness",
              steps: [
                "Open the Draw tab.",
                "Use Ink color to pick a stroke color.",
                "Use Stroke thickness to make lines finer or bolder."
              ],
              tip: "Highlighter plus a light color is perfect for study notes."
            },
            {
              id: "txt-eraser", title: "Erase ink",
              steps: [
                "Open the Draw tab and choose Eraser.",
                "Drag over the strokes to remove.",
                "Use Clear all ink to wipe every stroke at once."
              ],
              tip: "Erasing never touches your typed text."
            }
          ]
        },
        {
          id: "design", title: "Design tab", tryTab: "design",
          features: [
            {
              id: "txt-theme", title: "Document themes",
              steps: [
                "Open the Design tab.",
                "Pick a theme: Corporate Swiss, Academic Serif, Modern Tech, Editorial Magazine or Manuscript Mono.",
                "Headings, fonts and colors update across the whole document."
              ],
              tip: "Academic Serif suits school assignments."
            },
            {
              id: "txt-watermark", title: "Watermark",
              steps: [
                "Open the Design tab and click Watermark.",
                "Type the watermark text, for example DRAFT.",
                "Choose diagonal or horizontal style and a size, then apply."
              ],
              tip: "Watermarks sit behind the text on every page."
            }
          ]
        },
        {
          id: "layout", title: "Layout tab", tryTab: "layout",
          features: [
            {
              id: "txt-margins", title: "Page margins",
              steps: [
                "Open the Layout tab.",
                "Click Margins and pick a preset, or open Custom margins and type a pixel value.",
                "Watch the page preview update as you change the value."
              ],
              tip: "Wider margins leave room for printed comments."
            },
            {
              id: "txt-orient", title: "Orientation and paper size",
              steps: [
                "Open the Layout tab.",
                "Choose Portrait or Landscape orientation.",
                "Use Paper size to switch between A4, Letter and other sizes."
              ],
              tip: "Landscape fits wide tables without shrinking text."
            },
            {
              id: "txt-columns", title: "Text columns",
              steps: [
                "Select the text to split into columns.",
                "Open the Layout tab and choose 1, 2 or 3 columns.",
                "Turn on Divider to draw a line between columns."
              ],
              tip: "Two columns give a newsletter look."
            }
          ]
        },
        {
          id: "refs", title: "References tab", tryTab: "refs",
          features: [
            {
              id: "txt-cite", title: "Insert a citation",
              steps: [
                "Place the caret where the citation belongs.",
                "Open the References tab and click Citation Manager.",
                "Choose the style: APA, MLA, Chicago, Harvard or IEEE.",
                "Fill in Author, Year, Title and Publisher, then insert."
              ],
              tip: "The in-text mark appears exactly where your caret was."
            },
            {
              id: "txt-bib", title: "Generate the bibliography",
              steps: [
                "Add all citations with the Citation Manager first.",
                "Place the caret where the reference list should go.",
                "Open the References tab and click Bibliography.",
                "Every cited source is listed in the chosen style."
              ],
              tip: "Add new citations first, then regenerate the bibliography."
            },
            {
              id: "txt-toc", title: "Table of contents",
              steps: [
                "Format your headings with Heading styles first.",
                "Place the caret at the start of the document.",
                "Open the References tab and click Generate TOC."
              ],
              tip: "Regenerate after adding new headings."
            },
            {
              id: "txt-footnote", title: "Footnotes",
              steps: [
                "Place the caret after the word to annotate.",
                "Open the References tab and click Insert Footnote.",
                "Type the note text in the dialog."
              ],
              tip: "Footnotes are numbered automatically."
            }
          ]
        },
        {
          id: "review", title: "Review tab", tryTab: "review",
          features: [
            {
              id: "txt-track", title: "Track changes",
              steps: [
                "Open the Review tab and turn on Track Changes.",
                "Edit the document; insertions and deletions are marked.",
                "Use Review Changes to step through each edit.",
                "Click Accept All or Reject All to finish."
              ],
              tip: "Perfect for proofreading with a classmate."
            },
            {
              id: "txt-comments", title: "Comments",
              steps: [
                "Select the text to comment on.",
                "Open the Review tab and click New Comment.",
                "Type the comment and save.",
                "Open Show Comments anytime to read the full thread."
              ],
              tip: "Comments do not print with the document."
            },
            {
              id: "txt-readability", title: "Readability statistics",
              steps: [
                "Open the Review tab.",
                "Click Readability to see word counts and reading scores.",
                "Check the grade level to match your audience."
              ],
              tip: "Useful for checking assignment length requirements."
            }
          ]
        },
        {
          id: "view", title: "View tab", tryTab: "view",
          features: [
            {
              id: "txt-views", title: "Switch document views",
              steps: [
                "Open the View tab.",
                "Choose Print Layout for paged editing, Web Continuous for endless scrolling, or Outline to see headings only.",
                "Try Split Screen to read two parts side by side."
              ],
              tip: "Outline view is the fastest way to reorganize long documents."
            },
            {
              id: "txt-zoom", title: "Zoom",
              steps: [
                "Open the View tab.",
                "Use Zoom Out and Zoom In, or pick an exact level from the Zoom dropdown.",
                "The zoom level is remembered for your next session."
              ],
              tip: "Zoom only changes your display, never the printed size."
            },
            {
              id: "txt-immersive", title: "Immersive reader",
              steps: [
                "Open the View tab.",
                "Click Immersive Reader for a focused, distraction-free reading view.",
                "Exit to return to the normal editor."
              ],
              tip: "Great for proofreading before submission."
            }
          ]
        },
        {
          id: "access", title: "Accessibility tab", tryTab: "access",
          features: [
            {
              id: "txt-aloud", title: "Read aloud",
              steps: [
                "Open the Accessibility tab.",
                "Click Read Aloud to hear the document spoken.",
                "Click again to stop."
              ],
              tip: "Catches typos your eyes skip over."
            },
            {
              id: "txt-linefocus", title: "Line focus",
              steps: [
                "Open the Accessibility tab.",
                "Click Line Focus and choose 1, 3 or 5 lines.",
                "Only the focused lines stay bright while reading."
              ],
              tip: "Helps concentration on long readings."
            }
          ]
        }
      ]
    },

    /* ================= PXL : pixel photo studio ================= */
    pxl: {
      name: "PXL", code: "PXL", color: "#EC4899",
      desc: "Pixel photo studio",
      open: { kind: "persona", id: "pixel" },
      tabs: [
        {
          id: "tools", title: "Tools dock", tryTab: null,
          features: [
            {
              id: "pxl-brush", title: "Brush and eraser",
              steps: [
                "Open PXL and load a photo.",
                "Click Brush (B) in the tools dock.",
                "Paint on the canvas; the tool options bar shows size and opacity.",
                "Click Eraser (E) to remove paint strokes."
              ],
              tip: "Use the Panels button to open the panels sheet on mobile."
            },
            {
              id: "pxl-select", title: "Marquee, lasso and magic wand",
              steps: [
                "Click Marquee (M) and drag a rectangle to select an area.",
                "Click Lasso (L) and draw a freehand selection.",
                "Click Magic Wand (W), then click a color region to select similar pixels.",
                "Marching ants show the active selection."
              ],
              tip: "Selections limit edits to the chosen area."
            },
            {
              id: "pxl-crop", title: "Crop",
              steps: [
                "Click Crop (C) in the tools dock.",
                "Drag the crop handles to frame the photo.",
                "Confirm to apply the crop."
              ],
              tip: "Cropping is non-destructive until you export."
            },
            {
              id: "pxl-clone", title: "Clone stamp and eyedropper",
              steps: [
                "Click Clone Stamp (S), then Alt-click a source area.",
                "Paint over the area to fix; pixels copy from the source.",
                "Click Eyedropper (I) and click any pixel to sample its color."
              ],
              tip: "Clone stamp removes small blemishes cleanly."
            }
          ]
        },
        {
          id: "layers", title: "Layers", tryTab: null,
          features: [
            {
              id: "pxl-layer-new", title: "Add and arrange layers",
              steps: [
                "Open the Layers panel.",
                "Click New layer to add a transparent layer.",
                "Drag layers to reorder; the top layer paints over lower ones.",
                "Click the eye icon to hide or show a layer."
              ],
              tip: "Keep edits on separate layers so you can undo them independently."
            },
            {
              id: "pxl-layer-style", title: "Opacity, blend and lock",
              steps: [
                "Select a layer in the Layers panel.",
                "Drag Opacity to fade the layer.",
                "Change the blend mode to mix it with layers below.",
                "Click the lock icon to protect a layer from edits."
              ],
              tip: "Lower opacity on a duplicate layer for a soft glow effect."
            },
            {
              id: "pxl-layer-dup", title: "Duplicate and rename",
              steps: [
                "Right-click a layer, or use the layer menu.",
                "Choose Duplicate to copy it, or Rename to relabel it.",
                "Delete layers you no longer need."
              ],
              tip: "Duplicate the background before destructive edits as a backup."
            }
          ]
        },
        {
          id: "develop", title: "Develop panel", tryTab: null,
          features: [
            {
              id: "pxl-basic", title: "Basic tone and presence",
              steps: [
                "Open the Develop panel in the panels sheet.",
                "Expand the Basic tone and presence accordion.",
                "Drag Exposure to brighten or darken the whole photo.",
                "Use Contrast, Highlights, Shadows, Whites and Blacks to shape the tones.",
                "Finish with Vibrance and Saturation for color punch."
              ],
              tip: "Vibrance boosts dull colors while protecting skin tones."
            },
            {
              id: "pxl-curve", title: "Tone curve",
              steps: [
                "Open the Develop panel and expand Tone curve.",
                "Click on the curve to add a point.",
                "Drag points up to brighten that tonal range, down to darken it.",
                "Drag a point off the editor to remove it."
              ],
              tip: "A gentle S-curve adds contrast that looks natural."
            },
            {
              id: "pxl-hsl", title: "HSL mixer",
              steps: [
                "Open the Develop panel and expand HSL mixer.",
                "Pick a color sector, for example reds or blues.",
                "Adjust Hue to shift the color, Saturation for intensity, Luminance for brightness.",
                "Try the targeted adjust: drag directly on the image."
              ],
              tip: "Desaturate everything except one color for a pop effect."
            },
            {
              id: "pxl-grading", title: "Color grading wheels",
              steps: [
                "Open the Develop panel and expand Color grading.",
                "Use the three wheels for shadows, midtones and highlights.",
                "Drag the dot away from center to tint that tonal range."
              ],
              tip: "Teal shadows plus warm highlights give a cinematic look."
            },
            {
              id: "pxl-detail", title: "Detail: sharpen and denoise",
              steps: [
                "Open the Develop panel and expand Detail.",
                "Raise Sharpening for crisper edges.",
                "Raise Luminance or Color noise reduction to clean grainy photos."
              ],
              tip: "Sharpen last, after all tone edits are done."
            },
            {
              id: "pxl-effects", title: "Effects: vignette and grain",
              steps: [
                "Open the Develop panel and expand Effects.",
                "Drag Vignette amount negative to darken the corners.",
                "Add Grain for a film-like texture."
              ],
              tip: "A subtle vignette pulls focus to the center."
            },
            {
              id: "pxl-calibration", title: "Calibration",
              steps: [
                "Open the Develop panel and expand Calibration.",
                "Shift the red, green and blue primaries to re-tune the color science.",
                "Use Shadows tint for a final color nudge."
              ],
              tip: "Small calibration moves change the whole mood."
            },
            {
              id: "pxl-lens", title: "Lens corrections",
              steps: [
                "Open the Develop panel and expand Lens.",
                "Correct distortion and chromatic aberration from the lens.",
                "Straighten tilted horizons."
              ],
              tip: "Fix geometry before cropping so edges stay clean."
            }
          ]
        },
        {
          id: "histogram", title: "Histogram", tryTab: null,
          features: [
            {
              id: "pxl-hist", title: "Read the histogram",
              steps: [
                "Open the Histogram panel.",
                "White shows luminance; red, green and blue show each channel.",
                "A graph bunched left means underexposed; bunched right means overexposed.",
                "Clipping overlays mark pure black and pure white areas."
              ],
              tip: "Aim for data spread across the graph with no hard clipping."
            },
            {
              id: "pxl-tonal", title: "Drag tonal zones",
              steps: [
                "Open the Histogram panel.",
                "Drag directly on the blacks, shadows, midtones, highlights or whites zone.",
                "Watch the image update live as you drag."
              ],
              tip: "Faster than finding the right slider."
            }
          ]
        },
        {
          id: "presets", title: "Presets", tryTab: null,
          features: [
            {
              id: "pxl-preset", title: "Apply a preset",
              steps: [
                "Open the Presets panel.",
                "Browse the 8 folders of built-in looks.",
                "Hover a preset to preview it on your photo.",
                "Click to apply, then use the Intensity slider from 0 to 200 percent."
              ],
              tip: "Intensity below 100 percent softens strong presets."
            },
            {
              id: "pxl-preset-custom", title: "Save your own preset",
              steps: [
                "Dial in a look with the Develop sliders.",
                "Open the Presets panel and click New preset.",
                "Name it; it is stored with your settings.",
                "Export presets as JSON to share them."
              ],
              tip: "Build a personal folder of your signature looks."
            }
          ]
        },
        {
          id: "masks", title: "Masks", tryTab: null,
          features: [
            {
              id: "pxl-mask", title: "Mask an edit to part of the photo",
              steps: [
                "Open the Masks panel.",
                "Add a Linear gradient, Radial gradient or Brush mask.",
                "Paint or position the mask over the target area.",
                "Develop sliders now affect only the masked region."
              ],
              tip: "Masks are labeled beta heuristic; check edges at 100 percent zoom."
            }
          ]
        },
        {
          id: "history", title: "History and filmstrip", tryTab: null,
          features: [
            {
              id: "pxl-history", title: "Undo with history and snapshots",
              steps: [
                "Open the History panel to see every edit step.",
                "Click any step to jump back to it.",
                "Save a Snapshot to bookmark a look you like.",
                "Press Backslash or Y to toggle before and after."
              ],
              tip: "Snapshots let you compare two directions safely."
            },
            {
              id: "pxl-filmstrip", title: "Filmstrip ratings",
              steps: [
                "Open the Filmstrip panel.",
                "Rate photos with stars and flag picks or rejects.",
                "Copy settings from one photo and paste onto others."
              ],
              tip: "Batch-apply one good edit across a whole shoot."
            }
          ]
        },
        {
          id: "export", title: "Export", tryTab: null,
          features: [
            {
              id: "pxl-export", title: "Export the finished image",
              steps: [
                "Click Export in the Develop panel.",
                "Choose JPG, PNG or WEBP.",
                "Turn on the H3NZ watermark to stamp your work.",
                "Download the file to your device."
              ],
              tip: "PNG is lossless; JPG is smaller for sharing."
            },
            {
              id: "pxl-sendtxt", title: "Send to TXT",
              steps: [
                "Click Send to TXT in the top bar.",
                "The flattened composite is inserted into your TXT document.",
                "Continue editing the document around the inserted image."
              ],
              tip: "The fastest route from edited photo to document."
            }
          ]
        }
      ]
    },

    /* ================= VAC : vector studio ================= */
    vac: {
      name: "VAC", code: "VAC", color: "#84CC16",
      desc: "VAC drawing studio",
      open: { kind: "persona", id: "vac" },
      tabs: [
        {
          id: "tools", title: "Tools", tryTab: null,
          features: [
            {
              id: "vac-select", title: "Select and direct select",
              steps: [
                "Open VAC and create or open a drawing.",
                "Click Select (V) and click any shape to move it.",
                "Click Direct select (A), then click an anchor point to move just that point.",
                "Drag a marquee to select several objects at once."
              ],
              tip: "Direct select edits the shape itself; Select moves the whole object."
            },
            {
              id: "vac-pen", title: "Pen tool",
              steps: [
                "Click Pen (P) in the tools.",
                "Click to place anchor points; click and drag to pull out curve handles.",
                "Click the first point to close the path.",
                "Press Escape to finish an open path."
              ],
              tip: "Fewer points make smoother curves."
            },
            {
              id: "vac-shapes", title: "Shapes",
              steps: [
                "Click Shapes (M).",
                "Drag on the pasteboard to draw rectangles and ellipses.",
                "Hold Shift while dragging for perfect squares and circles."
              ],
              tip: "Shapes stay editable: resize them anytime with Select."
            },
            {
              id: "vac-type", title: "Type tool",
              steps: [
                "Click Type (T).",
                "Click on the pasteboard and type your text.",
                "Select the text to change font, size and color in the appearance panel."
              ],
              tip: "Text stays as live text, not outlines, until you export."
            },
            {
              id: "vac-eyedropper", title: "Eyedropper",
              steps: [
                "Click Eyedropper (I).",
                "Click any object to copy its fill and stroke onto the current selection.",
                "The sampled colors appear in the appearance panel."
              ],
              tip: "The fastest way to match brand colors."
            }
          ]
        },
        {
          id: "artboards", title: "Artboards", tryTab: null,
          features: [
            {
              id: "vac-artboard", title: "Add artboards",
              steps: [
                "Open the Artboards panel.",
                "Choose a preset size from the dropdown, or set a custom size.",
                "Click Add to place a new artboard on the 10,000 pixel pasteboard.",
                "Click an artboard to make it active."
              ],
              tip: "Keep logo variations on separate artboards."
            },
            {
              id: "vac-artboard-export", title: "Export per artboard",
              steps: [
                "Open the Export panel.",
                "Choose which artboard to export.",
                "Pick SVG, PNG, PDF or EPS and export."
              ],
              tip: "Each artboard exports as its own file."
            }
          ]
        },
        {
          id: "appearance", title: "Appearance", tryTab: null,
          features: [
            {
              id: "vac-gradient", title: "Gradient builder",
              steps: [
                "Select an object.",
                "Open the Gradient panel.",
                "Click on the gradient bar to add color stops.",
                "Drag stops to reposition them; click a stop to change its color.",
                "Switch between linear and radial gradient types."
              ],
              tip: "Two stops close together make a hard color edge."
            },
            {
              id: "vac-swatches", title: "Global swatches",
              steps: [
                "Open the Swatches panel.",
                "Create a swatch from the current fill color.",
                "Apply the swatch to any objects.",
                "Edit the swatch once to update every object using it."
              ],
              tip: "Global swatches keep brand colors consistent."
            },
            {
              id: "vac-stroke", title: "Strokes",
              steps: [
                "Select an object.",
                "Open the Stroke panel.",
                "Set the stroke width, cap style and join style.",
                "Add dashed strokes with custom dash patterns."
              ],
              tip: "Round caps soften line endings."
            },
            {
              id: "vac-transform", title: "Transform",
              steps: [
                "Select an object.",
                "Open the Transform panel.",
                "Type exact X, Y, width and height values.",
                "Rotate, scale and flip with numeric precision."
              ],
              tip: "Numeric transforms beat eyeballing for logos."
            }
          ]
        },
        {
          id: "pathfinder", title: "Pathfinder", tryTab: null,
          features: [
            {
              id: "vac-pathfinder", title: "Combine shapes",
              steps: [
                "Select two or more overlapping shapes.",
                "Open the Pathfinder panel.",
                "Click Unite to merge them into one shape.",
                "Click Minus Front to cut the front shape out of the back one.",
                "Try Intersect and Exclude for the other boolean operations."
              ],
              tip: "Unite first, then edit the merged anchors with Direct select."
            },
            {
              id: "vac-align", title: "Align and distribute",
              steps: [
                "Select several objects.",
                "Open the Align panel.",
                "Click Align Left, Center or Right, and Align Top, Middle or Bottom.",
                "Use Distribute to space objects evenly."
              ],
              tip: "Align to the artboard for perfectly centered logos."
            }
          ]
        },
        {
          id: "layers", title: "Layers", tryTab: null,
          features: [
            {
              id: "vac-layers", title: "Organize with layers",
              steps: [
                "Open the Layers panel.",
                "Create new layers and drag objects between them.",
                "Lock layers to protect finished artwork.",
                "Toggle visibility with the eye icon."
              ],
              tip: "Name layers as you go; future you will be grateful."
            },
            {
              id: "vac-isolation", title: "Isolation mode",
              steps: [
                "Double-click a group to enter isolation mode.",
                "Everything else dims so you can edit inside the group.",
                "Double-click empty space to exit."
              ],
              tip: "The safe way to edit inside complex groups."
            }
          ]
        },
        {
          id: "trace", title: "Image Trace", tryTab: null,
          features: [
            {
              id: "vac-trace", title: "Trace a raster image",
              steps: [
                "Place or paste a raster image on the pasteboard.",
                "Select it and open the Trace panel.",
                "Adjust the threshold to balance detail against noise.",
                "Click Trace to convert it to editable vector paths."
              ],
              tip: "High-contrast black and white art traces cleanest."
            },
            {
              id: "vac-outline", title: "Outline mode",
              steps: [
                "Open the View panel.",
                "Switch to Outline mode to see pure paths without fills.",
                "Check for stray points and open paths, then switch back."
              ],
              tip: "Outline mode reveals hidden junk in traced art."
            },
            {
              id: "vac-guides", title: "Smart guides",
              steps: [
                "Open the View panel and turn on Smart guides.",
                "Move objects; guides snap to edges, centers and equal spacing.",
                "Hold the snap to align precisely."
              ],
              tip: "Smart guides make manual alignment nearly automatic."
            }
          ]
        },
        {
          id: "publish", title: "Publish", tryTab: null,
          features: [
            {
              id: "vac-publish", title: "Send to TXT, DCK and PDF",
              steps: [
                "Finish your vector artwork.",
                "Open the Export panel.",
                "Choose Publish to TXT to insert it into a document.",
                "Or publish to DCK for slides, or to PDF."
              ],
              tip: "Vectors stay sharp at any size in documents."
            }
          ]
        }
      ]
    },

    /* ================= DCK : slide deck studio ================= */
    dck: {
      name: "DCK", code: "DCK", color: "#FF2E93",
      desc: "Slide deck generator",
      open: { kind: "app", id: "dck" },
      tabs: [
        {
          id: "home", title: "Home tab", tryTab: "home",
          features: [
            {
              id: "dck-new", title: "New deck and slides",
              steps: [
                "Open DCK and click New deck, or pick the Pitch template for a head start.",
                "In the editor, open the Home tab.",
                "Click New Slide and choose a layout: blank, cover, compare, KPI, roadmap or chart.",
                "Click a filmstrip thumbnail to jump to that slide."
              ],
              tip: "The Pitch template gives you 5 structured slides instantly."
            },
            {
              id: "dck-text", title: "Add and edit text",
              steps: [
                "Click any text block on the slide to edit it.",
                "Type, then click outside the block to finish.",
                "Drag the block by its move handle to reposition it.",
                "Drag the resize handle to change its size."
              ],
              tip: "Your edits save automatically as you type."
            },
            {
              id: "dck-bullets", title: "Bullet blocks",
              steps: [
                "Open the Home tab and insert a Bullets block.",
                "Click a bullet and type; Enter adds the next bullet.",
                "Drag the block where you want it on the slide."
              ],
              tip: "Keep bullets short; one idea per line."
            }
          ]
        },
        {
          id: "insert", title: "Insert tab", tryTab: "insert",
          features: [
            {
              id: "dck-smartart", title: "SmartArt diagrams",
              steps: [
                "Open the Insert tab.",
                "Click SmartArt and pick a diagram: Process Chevron Flow, Cycle, Hierarchy Org Chart, Pyramid Funnel, Venn, Timeline, Matrix Grid or SWOT Quadrant.",
                "Type your items; the diagram draws itself live.",
                "Edit the item list anytime to update the graphic."
              ],
              tip: "SWOT Quadrant is perfect for business class presentations."
            },
            {
              id: "dck-chart", title: "Charts",
              steps: [
                "Open the Insert tab and add a chart block.",
                "Choose bar, line or pie.",
                "Enter your values; the chart renders immediately."
              ],
              tip: "Charts scale cleanly because they are vector."
            },
            {
              id: "dck-image", title: "Images and shapes",
              steps: [
                "Open the Insert tab.",
                "Add an image block and choose a file.",
                "Add shape blocks for callouts and accents.",
                "Drag to position, resize with the corner handle."
              ],
              tip: "Exported PPTX keeps text, tables and charts editable."
            }
          ]
        },
        {
          id: "draw", title: "Draw tab", tryTab: "draw",
          features: [
            {
              id: "dck-ink", title: "Ink annotations",
              steps: [
                "Open the Draw tab.",
                "Pick the pen, highlighter or eraser.",
                "Draw over the slide to annotate.",
                "Ink is labeled separately from slide content."
              ],
              tip: "Circle key numbers during a live walkthrough."
            }
          ]
        },
        {
          id: "design", title: "Design tab", tryTab: "design",
          features: [
            {
              id: "dck-theme", title: "Themes",
              steps: [
                "Open the Design tab.",
                "Pick from 8 themes: Studio, Obsidian, Carbon, Paper, Sunset, Ocean and more.",
                "Colors, backgrounds and accents update on every slide."
              ],
              tip: "Obsidian looks great projected in dark rooms."
            },
            {
              id: "dck-master", title: "Slide master",
              steps: [
                "Open the View tab and switch to Master view.",
                "Edit the master to change fonts and placeholders everywhere.",
                "Return to normal view; all slides inherit the change."
              ],
              tip: "Set your title font once in the master."
            }
          ]
        },
        {
          id: "transitions", title: "Transitions tab", tryTab: "transitions",
          features: [
            {
              id: "dck-transition", title: "Slide transitions",
              steps: [
                "Select a slide in the filmstrip.",
                "Open the Transitions tab.",
                "Pick from 13 transitions: Fade Up, Zoom In, Slide Left and more.",
                "Preview it instantly on the stage."
              ],
              tip: "Use one transition style for the whole deck."
            },
            {
              id: "dck-morph", title: "Morph",
              steps: [
                "Give matching objects the same morph ID on two slides.",
                "Open the Transitions tab and choose Morph.",
                "Objects glide smoothly between the slides when presenting."
              ],
              tip: "Morph makes diagrams feel animated with zero keyframes."
            }
          ]
        },
        {
          id: "animations", title: "Animations tab", tryTab: "animations",
          features: [
            {
              id: "dck-anim", title: "Animate blocks",
              steps: [
                "Select a block on the slide.",
                "Open the Animations tab.",
                "Choose an entrance, emphasis or exit animation.",
                "Open the timeline pane to set duration, delay and easing.",
                "Reorder animations by dragging in the timeline."
              ],
              tip: "Stagger bullet entrances for a polished reveal."
            }
          ]
        },
        {
          id: "slideshow", title: "Slide Show tab", tryTab: "slideshow",
          features: [
            {
              id: "dck-present", title: "Present",
              steps: [
                "Open the Slide Show tab, or press F5.",
                "Click through slides with arrow keys or clicks.",
                "Press Escape to exit."
              ],
              tip: "Shift+F5 starts from the current slide."
            },
            {
              id: "dck-console", title: "Presenter console",
              steps: [
                "Start the show; the presenter console opens in a second window.",
                "Read your speaker notes while the audience sees only slides.",
                "Use the timer, laser pointer and blackout controls.",
                "Navigate with the filmstrip without showing it to the audience."
              ],
              tip: "Put the console on your laptop, slides on the projector."
            },
            {
              id: "dck-notes", title: "Speaker notes",
              steps: [
                "Select a slide.",
                "Type in the speaker notes box below the stage.",
                "Notes appear in the presenter console and printouts."
              ],
              tip: "Notes never show on the audience screen."
            }
          ]
        },
        {
          id: "export", title: "Export", tryTab: "view",
          features: [
            {
              id: "dck-export", title: "Export the deck",
              steps: [
                "Open the View tab or the export controls.",
                "Choose PPTX for PowerPoint, PDF for handouts, PNG for images, or HTML5 for the web player.",
                "Every export is stamped with your H3NZ credit."
              ],
              tip: "PPTX keeps text, tables and charts editable."
            },
            {
              id: "dck-txt", title: "Generate from a TXT document",
              steps: [
                "Write your content in TXT with clear headings.",
                "In DCK, use Generate from document.",
                "Headings become slides automatically."
              ],
              tip: "The fastest outline-to-deck workflow."
            }
          ]
        }
      ]
    },

    /* ================= GRD : spreadsheet ================= */
    grd: {
      name: "GRD", code: "GRD", color: "#06B6D4",
      desc: "Spreadsheet grid and kanban",
      open: { kind: "app", id: "grd" },
      tabs: [
        {
          id: "grid", title: "Grid view", tryTab: null,
          features: [
            {
              id: "grd-enter", title: "Enter and edit data",
              steps: [
                "Open GRD and create a new spreadsheet.",
                "Click any cell and start typing.",
                "Press Enter to move down, Tab to move right.",
                "Use the arrow keys to navigate; Home and End jump to row edges."
              ],
              tip: "Double-click a cell to edit without replacing its contents."
            },
            {
              id: "grd-format", title: "Format cells",
              steps: [
                "Select cells by dragging across them.",
                "Open the format toolbar.",
                "Apply bold, colors, number formats and alignment."
              ],
              tip: "Format header rows bold with a fill color."
            },
            {
              id: "grd-formula", title: "Formulas",
              steps: [
                "Click a cell and type = to start a formula.",
                "Reference other cells, for example =A1+B1.",
                "Press Enter; the result computes live."
              ],
              tip: "Formulas recalculate when source cells change."
            }
          ]
        },
        {
          id: "kanban", title: "Kanban view", tryTab: null,
          features: [
            {
              id: "grd-kanban", title: "Manage tasks on a board",
              steps: [
                "Switch to the Kanban view.",
                "Cards represent your rows as movable tasks.",
                "Drag cards between columns to change their status.",
                "Click a card to edit its details."
              ],
              tip: "Perfect for tracking assignment progress."
            }
          ]
        },
        {
          id: "charts", title: "Charts view", tryTab: null,
          features: [
            {
              id: "grd-chart", title: "Chart your data",
              steps: [
                "Fill the grid with numbers first.",
                "Switch to the Charts view.",
                "Pick a chart type for the selected range.",
                "The chart updates when the data changes."
              ],
              tip: "Keep labels in the first row for clean axes."
            }
          ]
        },
        {
          id: "share", title: "Share", tryTab: null,
          features: [
            {
              id: "grd-push", title: "Push to TXT",
              steps: [
                "Select the range to share.",
                "Click Push GRD selection to TXT.",
                "The data lands in your document as a live table."
              ],
              tip: "The table stays linked to the sheet."
            }
          ]
        }
      ]
    },

    /* ================= MEM : notes ================= */
    mem: {
      name: "MEM", code: "MEM", color: "#10B981",
      desc: "Notes and whiteboard",
      open: { kind: "app", id: "mem" },
      tabs: [
        {
          id: "notes", title: "Notes", tryTab: null,
          features: [
            {
              id: "mem-note", title: "Write a note",
              steps: [
                "Open MEM and click New note.",
                "Type in the note body; it saves automatically.",
                "Rename the note from its title.",
                "Delete notes you no longer need from the file menu."
              ],
              tip: "Notes sync into HUB so you can find them later."
            },
            {
              id: "mem-checklist", title: "Checklists",
              steps: [
                "Click New checklist.",
                "Type items, one per line.",
                "Click an item's checkbox to mark it done."
              ],
              tip: "Great for packing lists and study tasks."
            }
          ]
        },
        {
          id: "board", title: "Whiteboard", tryTab: null,
          features: [
            {
              id: "mem-whiteboard", title: "Draw on the whiteboard",
              steps: [
                "Click New whiteboard.",
                "Sketch with the drawing tools.",
                "Add sticky notes anywhere on the board.",
                "Switch between Masonry and Board layout for your notes collection."
              ],
              tip: "Whiteboards are infinite; zoom out to see everything."
            }
          ]
        }
      ]
    },

    /* ================= PDF : pdf toolkit ================= */
    pdf: {
      name: "PDF", code: "PDF", color: "#F59E0B",
      desc: "PDF toolkit",
      open: { kind: "app", id: "pdf" },
      tabs: [
        {
          id: "studio", title: "PDF Studio", tryTab: null,
          features: [
            {
              id: "pdf-open", title: "Open a document",
              steps: [
                "Open the PDF app.",
                "Click Open PDF Studio, or convert a TXT document directly.",
                "Use the zoom controls and Fit to size the page.",
                "Browse with the Bookmarks panel for long documents."
              ],
              tip: "Headings from TXT become bookmarks automatically."
            },
            {
              id: "pdf-annotate", title: "Highlight and notes",
              steps: [
                "Click Highlight, then drag over text.",
                "Click Note, then click the page to pin a comment.",
                "Pick highlight and shape colors from the toolbar.",
                "Click Undo to remove the last annotation."
              ],
              tip: "Yellow is the classic study highlight."
            },
            {
              id: "pdf-shape", title: "Shapes",
              steps: [
                "Click Shape and choose Rectangle or other shapes.",
                "Drag on the page to draw it.",
                "Move and resize shapes after drawing."
              ],
              tip: "Boxes around key figures stand out in review."
            }
          ]
        },
        {
          id: "sign", title: "Sign", tryTab: null,
          features: [
            {
              id: "pdf-sign", title: "Sign a document",
              steps: [
                "Click Sign in the toolbar.",
                "Create a New signature by drawing it.",
                "Click the page where the signature goes.",
                "Signatures are listed in the side panel."
              ],
              tip: "Reuse a saved signature across documents."
            }
          ]
        },
        {
          id: "redact", title: "Redact", tryTab: null,
          features: [
            {
              id: "pdf-redact", title: "Redact sensitive text",
              steps: [
                "Click Redact in the toolbar.",
                "Mark the regions to black out.",
                "Click Apply redactions to burn them in permanently."
              ],
              tip: "Redaction is permanent; keep an unredacted copy."
            }
          ]
        },
        {
          id: "export", title: "Export", tryTab: null,
          features: [
            {
              id: "pdf-export", title: "Export and print",
              steps: [
                "Click Export HTML for a web page version.",
                "Click Export TXT for plain text.",
                "Click Export / Print for a printer-ready copy."
              ],
              tip: "HTML export keeps headings and links."
            }
          ]
        }
      ]
    },

    /* ================= HUB : files and storage ================= */
    hub: {
      name: "HUB", code: "HUB", color: "#3B82F6",
      desc: "Files and storage",
      open: { kind: "app", id: "hub" },
      tabs: [
        {
          id: "recent", title: "Recent tab", tryTab: null,
          features: [
            {
              id: "hub-recent", title: "Find recent work",
              steps: [
                "Open HUB.",
                "The Recent tab lists everything you touched, newest first.",
                "Click any item to open it in its app."
              ],
              tip: "The fastest way back to yesterday's document."
            }
          ]
        },
        {
          id: "files", title: "Files tab", tryTab: null,
          features: [
            {
              id: "hub-files", title: "Browse all app files",
              steps: [
                "Open the Files tab.",
                "Files are grouped by app: TXT, GRD, DCK, MEM, PDF, VAC and PXL.",
                "Click a file to open it.",
                "Rename or delete from the file menu."
              ],
              tip: "One search box finds files across every app."
            },
            {
              id: "hub-new", title: "Create from HUB",
              steps: [
                "In the Files tab, click New.",
                "Choose New TXT document, New GRD sheet, New DCK deck or New MEM note.",
                "The file opens in its app immediately."
              ],
              tip: "Create without opening the app first."
            }
          ]
        },
        {
          id: "clipboard", title: "Clipboard tab", tryTab: null,
          features: [
            {
              id: "hub-clipboard", title: "Cross-app clipboard",
              steps: [
                "Copy content in any app.",
                "Open the Clipboard tab in HUB to see it.",
                "Paste it into another app."
              ],
              tip: "Move a chart from GRD into a DCK slide this way."
            }
          ]
        },
        {
          id: "search", title: "Search", tryTab: null,
          features: [
            {
              id: "hub-search", title: "Search everything",
              steps: [
                "Click the search box in HUB.",
                "Type a word from any file name or content.",
                "Results show matching files and content snippets."
              ],
              tip: "Searches file contents, not just titles."
            }
          ]
        }
      ]
    }

  };

  T.NXT_TUTORIALS = TUTORIALS;
})();
