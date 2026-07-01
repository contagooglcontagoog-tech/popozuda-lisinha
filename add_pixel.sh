#!/bin/bash

PIXEL_CODE='<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,"script",
  "https://connect.facebook.net/en_US/fbevents.js");

  var pixelId = "SEU_PIXEL_ID_AQUI"; // SUBSTITUA AQUI PELO SEU PIXEL
  fbq("init", pixelId);

  // 1. PageView
  fbq("track", "PageView");

  document.addEventListener("DOMContentLoaded", function() {
    // 2. ViewContent
    if (window.location.pathname.includes("/products/")) {
       fbq("track", "ViewContent");
    }

    // 3. AddToCart
    var addToCartButtons = document.querySelectorAll("button[name=\"add\"], .add-to-cart-button, .quick-add__button");
    addToCartButtons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        fbq("track", "AddToCart");
      });
    });

    // 4. InitiateCheckout
    var checkoutButtons = document.querySelectorAll("a[href*=\"/checkout\"], form[action*=\"/checkout\"] button, button[name=\"checkout\"], #checkout");
    checkoutButtons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        fbq("track", "InitiateCheckout");
      });
    });

    // 5. Purchase
    if (window.location.pathname.includes("thank_you") || window.location.pathname.includes("order_status") || window.location.pathname.includes("checkouts")) {
        fbq("track", "Purchase", { currency: "BRL", value: 1.00 });
    }
  });
</script>
<noscript>
  <img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=SEU_PIXEL_ID_AQUI&ev=PageView&noscript=1"/>
</noscript>
<!-- End Meta Pixel Code -->
</head>'

# Escape newlines and ampersands for awk
AWK_SCRIPT='
/<\/head>/ {
    if (!inserted) {
        print "'"$(echo "$PIXEL_CODE" | awk '{printf "%s\\n", $0}')"'";
        inserted = 1;
        next;
    }
}
{ print }
'

find . -name "index.html" -type f | while read -r file; do
    if ! grep -q "Meta Pixel Code" "$file"; then
        awk "$AWK_SCRIPT" "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
        echo "Injected pixel into $file"
    else
        echo "Pixel already in $file"
    fi
done
