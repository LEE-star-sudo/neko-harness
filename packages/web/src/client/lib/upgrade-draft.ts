/** Text-only recovery for user-triggered upgrade reloads. Never automatically submits. */
export type UpgradeDraft = {
	version: 1;
	serverId: string;
	workspace: string;
	session: string | null;
	text: string;
	requestId: string;
};
const KEY = "neko.upgrade-draft.v1";
export function readUpgradeDraft(storage: Pick<Storage, "getItem"> = sessionStorage): UpgradeDraft | null {
	try {
		const v = JSON.parse(storage.getItem(KEY) ?? "null");
		if (
			v?.version === 1 &&
			typeof v.serverId === "string" &&
			typeof v.workspace === "string" &&
			(typeof v.session === "string" || v.session === null) &&
			typeof v.text === "string" &&
			typeof v.requestId === "string"
		)
			return v;
	} catch {}
	return null;
}
export function saveUpgradeDraft(value: UpgradeDraft, storage: Pick<Storage, "setItem" | "getItem"> = sessionStorage) {
	storage.setItem(KEY, JSON.stringify(value));
	if (storage.getItem(KEY) !== JSON.stringify(value)) throw new Error("Draft not saved");
}
export function removeUpgradeDraft() {
	sessionStorage.removeItem(KEY);
}
