// Port of apps/mobile/utils/cardArt/prefs.ts
//
// Card art preferences — persisted on this device only, never sent to the API. Photos are
// sensitive (the printed number may be visible), so each lives under its own key and
// clearAllCardArtPrefs() wipes everything; AuthStore.logout() calls it, which also covers
// account deletion. As in RN, the stored value is the photo's URI string, not the image bytes.

import Foundation

private let DESIGN_KEY = "ezer.cardArt.designs.v1"
private let PHOTO_KEY_PREFIX = "ezer.cardArt.photo.v1."

private func photoKey(_ cardId: String) -> String { "\(PHOTO_KEY_PREFIX)\(cardId)" }

private func readDesigns() -> [String: String] {
    KV.getJSON(DESIGN_KEY, as: [String: String].self) ?? [:]
}

/** Loads saved choices for the given cards. Never throws — a failure is "no prefs". */
func loadCardArtPrefs(_ cardIds: [String]) -> [String: CardArtPrefs] {
    let designs = readDesigns()
    var out: [String: CardArtPrefs] = [:]
    for id in cardIds {
        let photoUri = KV.get(photoKey(id))
        let designId = designs[id]
        if photoUri != nil || designId != nil { out[id] = CardArtPrefs(photoUri: photoUri, designId: designId) }
    }
    return out
}

func saveDesign(_ cardId: String, _ designId: String?) {
    var designs = readDesigns()
    if let designId { designs[cardId] = designId } else { designs.removeValue(forKey: cardId) }
    KV.setJSON(DESIGN_KEY, designs)
}

func savePhoto(_ cardId: String, _ photoUri: String?) {
    if let photoUri { KV.set(photoKey(cardId), photoUri) } else { KV.remove(photoKey(cardId)) }
}

/** Removes every stored card design and photo. Call on sign-out / deletion. */
func clearAllCardArtPrefs() {
    let mine = KV.allKeys().filter { $0 == DESIGN_KEY || $0.hasPrefix(PHOTO_KEY_PREFIX) }
    if !mine.isEmpty { KV.multiRemove(mine) }
}
