export interface LandingHandlers {
  onDemo(): void;
  onFiles(list: FileList): Promise<void> | void;
}

export function createLanding(root: HTMLElement, h: LandingHandlers) {
  const el = document.createElement('div');
  el.id = 'landing';
  el.innerHTML = `
    <div class="card glass">
      <h1>VAULT·3D</h1>
      <p class="tag">Your Obsidian second brain as a <em>3D hologram</em>,<br>controlled with your <em>bare hands</em> through the webcam.</p>
      <div class="cta">
        <button class="btn primary" id="l-demo">▶ Explore the demo</button>
        <button class="btn" id="l-pick">📁 Open your vault folder</button>
      </div>
      <div class="small">
        or drop a folder anywhere on this page<br>
        <b>100 % local</b> — your notes and your camera never leave this browser tab.<br>
        <a href="https://github.com/" id="l-gh" target="_blank" rel="noopener">Source on GitHub</a>
      </div>
      <div class="err" id="l-err"></div>
      <input type="file" id="l-input" webkitdirectory directory multiple hidden />
    </div>`;
  root.appendChild(el);
  const input = el.querySelector<HTMLInputElement>('#l-input')!;
  el.querySelector('#l-demo')!.addEventListener('click', h.onDemo);
  el.querySelector('#l-pick')!.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (!input.files?.length) return;
    // only reset once reading is done: some browsers invalidate the File objects when the input is cleared
    void Promise.resolve(h.onFiles(input.files)).finally(() => { input.value = ''; });
  });
  return {
    hide() { el.classList.add('hide'); setTimeout(() => (el.style.display = 'none'), 700); },
    show() { el.style.display = 'flex'; requestAnimationFrame(() => el.classList.remove('hide')); },
    error(msg: string) { el.querySelector('#l-err')!.textContent = msg; },
    setBusy(msg: string) { el.querySelector('#l-err')!.textContent = msg; },
    setRepoUrl(url: string) { (el.querySelector('#l-gh') as HTMLAnchorElement).href = url; },
  };
}
