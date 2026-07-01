import os
import glob

old_style = """<style>
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

new_style = """<style>
/* Corrige cores do popup de conta / login */
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
    
    if old_style in content:
        content = content.replace(old_style, new_style)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed style in {file}")

