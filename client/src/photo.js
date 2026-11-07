// Adulthood: taking pictures. Everything happens in your own browser. Nothing is uploaded anywhere.
const $ = (id) => document.getElementById(id);

export function initPhoto({ renderer, scene, camera, controls, getMe, getInfo }) {
  let blob = null;
  let url = null;

  function capture(selfie) {
    const me = getMe();
    const saved = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
    const hud = document.querySelectorAll('.panel');
    if (selfie && me) {
      // A temporary close-up camera in front of your character, looking at their face.
      const p = me.group.position;
      camera.position.set(p.x + 0.3, 1.5, p.z + 2.4);
      controls.target.set(p.x, 1.2, p.z);
      camera.lookAt(p.x, 1.2, p.z);
    }
    renderer.render(scene, camera); // draw now so the canvas is not blank
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const g = out.getContext('2d');
    g.drawImage(renderer.domElement, 0, 0);
    camera.position.copy(saved.pos);
    controls.target.copy(saved.target);
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
    void hud;
    const info = getInfo();
    const s = Math.max(1, Math.round(w / 700));
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, h - 44 * s, w, 44 * s);
    g.fillStyle = '#ffffff';
    g.font = `700 ${16 * s}px sans-serif`;
    g.textBaseline = 'middle';
    g.fillText('ADULTHOOD', 12 * s, h - 22 * s);
    g.font = `${13 * s}px sans-serif`;
    g.textAlign = 'right';
    g.fillText(info, w - 12 * s, h - 22 * s);
    g.textAlign = 'left';
    return new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9));
  }

  async function take(selfie) {
    const b = await capture(selfie);
    if (!b) return;
    if (url) URL.revokeObjectURL(url);
    blob = b;
    url = URL.createObjectURL(b);
    $('photoImg').src = url;
    $('photoModal').hidden = false;
    $('photoShare').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([b], 'adulthood.jpg', { type: 'image/jpeg' })] }));
  }

  function close() {
    $('photoModal').hidden = true;
    if (url) URL.revokeObjectURL(url);
    url = null;
    blob = null;
    $('photoImg').removeAttribute('src');
  }

  $('photoBtn').addEventListener('click', () => take(false));
  $('selfieBtn').addEventListener('click', () => take(true));
  $('photoClose').addEventListener('click', close);
  $('photoSave').addEventListener('click', () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `adulthood-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  $('photoShare').addEventListener('click', async () => {
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], 'adulthood.jpg', { type: 'image/jpeg' })], title: 'Adulthood' });
    } catch { /* cancelled */ }
  });
  return { close };
}