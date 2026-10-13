chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_7TV_EMOTES") {
    cargarEmotes(request.channel).then(emotes => sendResponse({ emotes }));
    return true; // Mantiene el canal abierto para respuesta asíncrona
  }
});

async function cargarEmotes(channel) {
  const map = {};

  try {
    // 1. Emotes globales
    const resGlobal = await fetch("https://7tv.io/v3/emote-sets/global");
    if (resGlobal.ok) {
      const data = await resGlobal.json();
      data.emotes?.forEach(e => {
        map[e.name] = `https://cdn.7tv.app/emote/${e.id}/1x.webp`;
      });
    }

    // 2. Emotes del streamer (si existe)
    if (channel) {
      const resUser = await fetch(`https://7tv.io/v3/users/twitch/${channel}`);
      if (resUser.ok) {
        const userData = await resUser.json();
        userData.emote_set?.emotes?.forEach(e => {
          map[e.name] = `https://cdn.7tv.app/emote/${e.id}/1x.webp`;
        });
      }
    }
  } catch (err) {
    console.error("[Background 7TV] Error:", err);
  }

  return map;
}