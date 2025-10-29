function proxye() {
  const urlInput = document.getElementById('url4');
  let url = urlInput.value.trim();
  
  if (!url) {
    alert('Please enter a URL');
    return;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  const cloakCheckbox = document.getElementById('cloak');
  if (cloakCheckbox && cloakCheckbox.checked) {
    const win = window.open('about:blank', '_blank');
    if (win) {
      win.document.write('<iframe src="/proxy?url=' + encodeURIComponent(url) + '" style="position:fixed;top:0;left:0;bottom:0;right:0;width:100%;height:100%;border:none;margin:0;padding:0;overflow:hidden;z-index:999999;"></iframe>');
    }
  } else {
    window.location.href = '/proxy?url=' + encodeURIComponent(url);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('url4');
  if (urlInput) {
    urlInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        proxye();
      }
    });
  }
});
