import os
import glob

style_code = """
<style>
/* Corrige cores do popup de conta / login */
shopify-account, 
shopify-account::part(popover),
shopify-account::part(dialog) {
  --color-foreground: #000000 !important;
  --color-background: #ffffff !important;
  --color-text: #000000 !important;
  color: #000000 !important;
  background-color: #ffffff !important;
}
shopify-account::part(heading),
shopify-account::part(text),
shopify-account::part(link),
shopify-account::part(button) {
  color: #000000 !important;
}
</style>
"""

html_files = glob.glob('**/*.html', recursive=True)

for file in html_files:
    if "_wget" in file:
        continue
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "/* Corrige cores do popup de conta" not in content and "</head>" in content:
        content = content.replace("</head>", style_code + "\n</head>")
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Injected style into {file}")

