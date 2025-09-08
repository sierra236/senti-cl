cat > public/app.js << 'EOF'
async function call(url, outId) {
  const out = document.getElementById(outId);
  out.textContent = "Yükleniyor...";
  try {
    const res = await fetch(url);
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    out.textContent = "Hata: " + e.message;
  }
}

document.getElementById("helloBtn").addEventListener("click", () => {
  call("/api/hello", "helloOut");
});

document.getElementById("timeBtn").addEventListener("click", () => {
  call("/api/time", "timeOut");
});
EOF
