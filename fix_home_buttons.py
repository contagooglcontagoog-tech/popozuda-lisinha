import os
import glob

script_code = """
<script>
document.addEventListener('DOMContentLoaded', function() {
    // Intercept clicks on quick-add buttons on the home page and collections to redirect to product page instead
    var quickAddForms = document.querySelectorAll('form[action^="/cart/add"]');
    quickAddForms.forEach(function(form) {
        var quickAddComponent = form.closest('quick-add-component');
        if (quickAddComponent) {
            var productUrl = quickAddComponent.getAttribute('data-product-url');
            if (productUrl) {
                var btn = form.querySelector('button[type="submit"], button[name="add"]');
                if (btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        // Get the variant ID if available
                        var variantInput = form.querySelector('input[name="id"]');
                        var url = productUrl;
                        if (variantInput && variantInput.value) {
                            url += '?variant=' + variantInput.value;
                        }
                        window.location.href = url;
                    });
                }
            }
        }
    });
});
</script>
"""

html_files = glob.glob('**/*.html', recursive=True)

for file in html_files:
    if "_wget" in file:
        continue
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "Intercept clicks on quick-add buttons" not in content and "</body>" in content:
        content = content.replace("</body>", script_code + "\n</body>")
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Injected redirect script into {file}")

