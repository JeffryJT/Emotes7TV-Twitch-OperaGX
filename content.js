const emotesMap = new Map();
let currentChannel = "";
let activeCard = null;
let emotePickerOpen = false;

// 1. Obtener nombre del streamer desde la URL
function getChannelName() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (!segments.length) return null;
  const ignored = ["directory", "videos", "p", "settings", "friends", "subscriptions"];
  return ignored.includes(segments[0].toLowerCase()) ? null : segments[0].toLowerCase();
}

// 2. Obtener el ID numérico de Twitch
async function getTwitchUserId(login) {
  try {
    const res = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: { "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko" },
      body: JSON.stringify({
        query: `query { user(login: "${login}") { id } }`
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.user?.id || null;
  } catch (e) {
    return null;
  }
}

// 3. Inserción compatible con el editor Draft.js / Slate de Twitch
function insertEmoteIntoChat(emoteName) {
  // Selector del editor interactivo editable de Twitch
  const editor = document.querySelector('[data-a-target="chat-input"]') || 
                 document.querySelector('.chat-wysiwyg-input__editor [contenteditable="true"]') ||
                 document.querySelector('[contenteditable="true"]');

  if (!editor) return;

  // Dar foco explícito para que Twitch retire el placeholder "Enviar un mensaje"
  editor.focus();

  // Asegurar selección al final del texto actual
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  // Inserción mediante InputEvent (compatible con React y borrado nativo con Backspace)
  const textToInsert = `${emoteName} `;
  let inserted = false;

  try {
    inserted = document.execCommand("insertText", false, textToInsert);
  } catch (err) {
    inserted = false;
  }

  if (!inserted) {
    const inputEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: textToInsert
    });
    editor.dispatchEvent(inputEvent);
  }

  // Notificar a React del cambio en el DOM
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

// 4. Panel selector de emotes con altura ajustada (por encima de la caja de texto)
function createEmotePicker() {
  if (document.getElementById("gx-emote-picker")) return;

  const picker = document.createElement("div");
  picker.id = "gx-emote-picker";
  picker.style.position = "absolute";
  // Elevado para dejar libre el cuadro de mensaje y los botones inferiores
  picker.style.bottom = "85px";
  picker.style.right = "10px";
  picker.style.width = "320px";
  picker.style.height = "380px";
  picker.style.backgroundColor = "#18181b";
  picker.style.border = "1px solid #303036";
  picker.style.borderRadius = "8px";
  picker.style.boxShadow = "0 8px 24px rgba(0,0,0,0.8)";
  picker.style.zIndex = "999999";
  picker.style.display = "none";
  picker.style.flexDirection = "column";
  picker.style.overflow = "hidden";
  picker.style.fontFamily = "Inter, sans-serif";

  // Cabecera con Buscador y botón X
  const header = document.createElement("div");
  header.style.padding = "8px";
  header.style.borderBottom = "1px solid #303036";
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Buscar emotes...";
  searchInput.style.flex = "1";
  searchInput.style.padding = "6px 10px";
  searchInput.style.backgroundColor = "#0e0e10";
  searchInput.style.border = "1px solid #3a3a44";
  searchInput.style.borderRadius = "6px";
  searchInput.style.color = "#efeff1";
  searchInput.style.fontSize = "13px";
  searchInput.style.outline = "none";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "Cerrar";
  closeBtn.style.background = "transparent";
  closeBtn.style.border = "none";
  closeBtn.style.color = "#adadb8";
  closeBtn.style.fontSize = "16px";
  closeBtn.style.fontWeight = "bold";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.padding = "4px 8px";
  closeBtn.style.borderRadius = "4px";
  closeBtn.style.display = "flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.lineHeight = "1";
  closeBtn.style.transition = "color 0.15s ease, background-color 0.15s ease";

  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.color = "#ffffff";
    closeBtn.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.color = "#adadb8";
    closeBtn.style.backgroundColor = "transparent";
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    picker.style.display = "none";
    emotePickerOpen = false;
  });

  header.appendChild(searchInput);
  header.appendChild(closeBtn);
  picker.appendChild(header);

  // Cuadrícula de emotes
  const grid = document.createElement("div");
  grid.id = "gx-picker-grid";
  grid.style.flex = "1";
  grid.style.overflowY = "auto";
  grid.style.padding = "10px";
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(36px, 1fr))";
  grid.style.gap = "8px";
  grid.style.alignContent = "start";
  picker.appendChild(grid);

  function renderEmotes(filterText = "") {
    grid.innerHTML = "";
    const filter = filterText.toLowerCase();

    emotesMap.forEach((data, name) => {
      if (filter && !name.toLowerCase().includes(filter)) return;

      const btn = document.createElement("button");
      btn.title = `${data.name} (${data.source})`;
      btn.style.background = "none";
      btn.style.border = "none";
      btn.style.cursor = "pointer";
      btn.style.padding = "4px";
      btn.style.borderRadius = "4px";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";

      btn.addEventListener("mouseenter", () => (btn.style.backgroundColor = "#26262c"));
      btn.addEventListener("mouseleave", () => (btn.style.backgroundColor = "transparent"));

      const img = document.createElement("img");
      img.src = data.url;
      img.alt = data.name;
      img.style.maxHeight = "28px";
      img.style.maxWidth = "28px";
      img.style.objectFit = "contain";

      btn.appendChild(img);

      btn.addEventListener("click", () => {
        insertEmoteIntoChat(data.name);
      });

      grid.appendChild(btn);
    });
  }

  searchInput.addEventListener("input", (e) => {
    renderEmotes(e.target.value);
  });

  picker.renderEmotes = renderEmotes;

  const chatContainer = document.querySelector(".chat-input, [data-a-target='chat-input']");
  const parent = chatContainer ? chatContainer.closest(".chat-input__textarea, .stream-chat") || document.body : document.body;
  parent.style.position = "relative";
  parent.appendChild(picker);

  return picker;
}

// 5. Inyectar botón de 7TV en la barra horizontal interna del chat
function injectPickerButton() {
  if (document.getElementById("gx-emote-btn")) return;

  // Localizar el botón de emotes nativo de Twitch
  const nativeBtn = document.querySelector('[data-a-target="emote-picker-button"]');
  if (!nativeBtn || !nativeBtn.parentNode) return;

  const parentContainer = nativeBtn.parentNode;
  
  // Asegurar que el contenedor padre mantenga la disposición horizontal y centrada
  parentContainer.style.display = "inline-flex";
  parentContainer.style.alignItems = "center";
  parentContainer.style.flexDirection = "row";

  const btn = document.createElement("button");
  btn.id = "gx-emote-btn";
  btn.title = "Emotes 7TV / BTTV";
  btn.style.background = "transparent";
  btn.style.border = "none";
  btn.style.cursor = "pointer";
  btn.style.padding = "4px";
  btn.style.borderRadius = "4px";
  btn.style.display = "inline-flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.verticalAlign = "middle";
  btn.style.marginLeft = "4px";
  btn.style.transition = "background-color 0.15s ease";

  btn.addEventListener("mouseenter", () => (btn.style.backgroundColor = "rgba(255, 255, 255, 0.1)"));
  btn.addEventListener("mouseleave", () => (btn.style.backgroundColor = "transparent"));

  // Logo oficial y vectorial de 7TV
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 18H88V32L46 84H28L66 32H12V18Z" fill="#00e5ff" />
    </svg>
  `;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    let picker = document.getElementById("gx-emote-picker");
    if (!picker) {
      picker = createEmotePicker();
    }

    emotePickerOpen = !emotePickerOpen;
    if (emotePickerOpen) {
      picker.style.display = "flex";
      picker.renderEmotes();
    } else {
      picker.style.display = "none";
    }
  });

  // Insertar inmediatamente a la derecha del botón nativo de emojis
  nativeBtn.after(btn);
}

// 6. Tarjeta al hacer clic sobre un emote en el chat
function showEmoteCard(emoteData, x, y) {
  if (activeCard) activeCard.remove();

  const card = document.createElement("div");
  card.style.position = "fixed";
  card.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  card.style.top = `${Math.min(y - 150, window.innerHeight - 170)}px`;
  card.style.zIndex = "999999";
  card.style.backgroundColor = "#18181b";
  card.style.color = "#efeff1";
  card.style.border = "1px solid #303036";
  card.style.borderRadius = "8px";
  card.style.padding = "12px";
  card.style.boxShadow = "0 8px 24px rgba(0,0,0,0.7)";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.alignItems = "center";
  card.style.gap = "6px";
  card.style.fontFamily = "Inter, sans-serif";
  card.style.minWidth = "170px";

  const bigImg = document.createElement("img");
  bigImg.src = emoteData.highResUrl;
  bigImg.style.maxHeight = "64px";
  bigImg.style.maxWidth = "64px";
  bigImg.style.objectFit = "contain";

  const title = document.createElement("span");
  title.textContent = emoteData.name;
  title.style.fontWeight = "bold";
  title.style.fontSize = "14px";

  const author = document.createElement("span");
  author.textContent = `Por: ${emoteData.owner}`;
  author.style.fontSize = "11px";
  author.style.color = "#adadb8";

  const sourceBadge = document.createElement("span");
  sourceBadge.textContent = emoteData.source;
  sourceBadge.style.fontSize = "10px";
  sourceBadge.style.padding = "2px 6px";
  sourceBadge.style.borderRadius = "4px";
  sourceBadge.style.backgroundColor = emoteData.source === "7TV" ? "#22c55e33" : "#ef444433";
  sourceBadge.style.color = emoteData.source === "7TV" ? "#4ade80" : "#f87171";

  const copiedNotice = document.createElement("span");
  copiedNotice.textContent = "¡Copiado!";
  copiedNotice.style.fontSize = "10px";
  copiedNotice.style.color = "#a855f7";

  navigator.clipboard.writeText(emoteData.name);

  card.appendChild(bigImg);
  card.appendChild(title);
  card.appendChild(author);
  card.appendChild(sourceBadge);
  card.appendChild(copiedNotice);

  document.body.appendChild(card);
  activeCard = card;
}

// Cerrar tarjeta o selector al hacer clic fuera
document.addEventListener("click", (e) => {
  if (activeCard && !activeCard.contains(e.target) && !e.target.classList.contains("custom-emote-img")) {
    activeCard.remove();
    activeCard = null;
  }
  const picker = document.getElementById("gx-emote-picker");
  const btn = document.getElementById("gx-emote-btn");
  if (picker && emotePickerOpen && !picker.contains(e.target) && !btn.contains(e.target)) {
    picker.style.display = "none";
    emotePickerOpen = false;
  }
});

// 7. Carga de emotes (7TV + BTTV)
async function loadAllEmotes() {
  const channel = getChannelName();
  if (!channel || channel === currentChannel) return;
  currentChannel = channel;

  emotesMap.clear();

  const twitchId = await getTwitchUserId(channel);

  // A. 7TV Globales
  try {
    const res7tvGlobal = await fetch("https://7tv.io/v3/emote-sets/global");
    if (res7tvGlobal.ok) {
      const data = await res7tvGlobal.json();
      (data.emotes || []).forEach(e => {
        emotesMap.set(e.name, {
          name: e.name,
          url: `https://cdn.7tv.app/emote/${e.id}/1x.webp`,
          highResUrl: `https://cdn.7tv.app/emote/${e.id}/3x.webp`,
          owner: e.owner?.display_name || "7TV Global",
          source: "7TV"
        });
      });
    }
  } catch (e) {
    console.warn("[Emotes GX] 7TV Global falló:", e);
  }

  // B. 7TV Canal
  if (twitchId) {
    try {
      const res7tvChannel = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`);
      if (res7tvChannel.ok) {
        const data = await res7tvChannel.json();
        (data.emote_set?.emotes || []).forEach(e => {
          emotesMap.set(e.name, {
            name: e.name,
            url: `https://cdn.7tv.app/emote/${e.id}/1x.webp`,
            highResUrl: `https://cdn.7tv.app/emote/${e.id}/3x.webp`,
            owner: e.owner?.display_name || "Streamer (7TV)",
            source: "7TV"
          });
        });
      }
    } catch (e) {
      console.warn("[Emotes GX] 7TV Canal falló:", e);
    }
  }

  // C. BetterTTV Globales
  try {
    const resBttvGlobal = await fetch("https://api.betterttv.net/3/cached/emotes/global");
    if (resBttvGlobal.ok) {
      const bttvGlobals = await resBttvGlobal.json();
      if (Array.isArray(bttvGlobals)) {
        bttvGlobals.forEach(e => {
          if (!emotesMap.has(e.code)) {
            emotesMap.set(e.code, {
              name: e.code,
              url: `https://cdn.betterttv.net/emote/${e.id}/1x`,
              highResUrl: `https://cdn.betterttv.net/emote/${e.id}/3x`,
              owner: "BTTV Global",
              source: "BetterTTV"
            });
          }
        });
      }
    }
  } catch (e) {
    console.warn("[Emotes GX] BTTV Global falló:", e);
  }

  // D. BetterTTV Canal
  if (twitchId) {
    try {
      const resBttvChannel = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
      if (resBttvChannel.ok) {
        const bttvData = await resBttvChannel.json();
        const allBttv = [...(bttvData.channelEmotes || []), ...(bttvData.sharedEmotes || [])];
        allBttv.forEach(e => {
          if (e && e.code && !emotesMap.has(e.code)) {
            emotesMap.set(e.code, {
              name: e.code,
              url: `https://cdn.betterttv.net/emote/${e.id}/1x`,
              highResUrl: `https://cdn.betterttv.net/emote/${e.id}/3x`,
              owner: e.user?.displayName || "Streamer (BTTV)",
              source: "BetterTTV"
            });
          }
        });
      }
    } catch (e) {
      console.warn("[Emotes GX] BTTV Canal falló:", e);
    }
  }

  // Respaldo KEKW
  if (!emotesMap.has("KEKW")) {
    emotesMap.set("KEKW", {
      name: "KEKW",
      url: "https://cdn.7tv.app/emote/60ae3e54229664e9625808b8/1x.webp",
      highResUrl: "https://cdn.7tv.app/emote/60ae3e54229664e9625808b8/3x.webp",
      owner: "Kekius",
      source: "7TV"
    });
  }

  console.log(`[Emotes GX] Emotes activos en total para ${channel}: ${emotesMap.size}`);
}

// 8. Reemplazo en el chat
function replaceInTextNode(node) {
  const text = node.nodeValue;
  if (!text || !text.trim()) return;

  const words = text.split(" ");
  const hasEmote = words.some(w => emotesMap.has(w));
  if (!hasEmote) return;

  const fragment = document.createDocumentFragment();

  words.forEach((word, idx) => {
    if (emotesMap.has(word)) {
      const data = emotesMap.get(word);
      const img = document.createElement("img");
      img.src = data.url;
      img.alt = data.name;
      img.title = `${data.name} (Clic para ver detalles)`;
      img.classList.add("custom-emote-img");
      img.style.height = "28px";
      img.style.verticalAlign = "middle";
      img.style.display = "inline-block";
      img.style.margin = "0 2px";
      img.style.cursor = "pointer";

      img.addEventListener("click", (e) => {
        e.stopPropagation();
        showEmoteCard(data, e.clientX, e.clientY);
      });

      fragment.appendChild(img);
    } else if (word) {
      fragment.appendChild(document.createTextNode(word));
    }

    if (idx < words.length - 1) {
      fragment.appendChild(document.createTextNode(" "));
    }
  });

  if (node.parentNode) {
    node.parentNode.replaceChild(fragment, node);
  }
}

// 9. Escanear nodos
function scan(element) {
  if (element.tagName === "IMG" || element.tagName === "SCRIPT" || element.tagName === "STYLE") return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  textNodes.forEach(replaceInTextNode);
}

// 10. Observador
const observer = new MutationObserver(mutations => {
  injectPickerButton(); // Asegurar que el botón sigue presente si React redibuja el chat
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        scan(node);
      }
    }
  }
});

loadAllEmotes().then(() => {
  injectPickerButton();
  observer.observe(document.body, { childList: true, subtree: true });
});

setInterval(() => {
  injectPickerButton();
  const ch = getChannelName();
  if (ch && ch !== currentChannel) {
    loadAllEmotes();
  }
}, 2500);