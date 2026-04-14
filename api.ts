import { requestUrl } from 'obsidian';

export interface CreateBinOptions {
	content: string;
	type?: string;
	language?: string;
	mode?: 'read-only' | 'editable' | 'forkable';
	password?: string;
	encrypted?: boolean;
	expires_at?: string | null;
	burn?: boolean;
}

export interface BinData {
	id: string;
	content: string;
	type: string;
	language: string | null;
	mode: 'read-only' | 'editable' | 'forkable';
	encrypted: boolean;
	forked_from: string | null;
	burn: boolean;
	created_at: string;
	updated_at: string;
}

export interface CreateBinResult {
	id: string;
	url: string;
}

export async function createBin(serverUrl: string, opts: CreateBinOptions): Promise<CreateBinResult> {
	const res = await requestUrl({
		url: `${serverUrl}/api/bin`,
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(opts),
	});

	if (res.status !== 201) {
		throw new Error(res.json?.error || `Failed to create bin (${res.status})`);
	}

	return res.json;
}

export async function getBin(serverUrl: string, id: string): Promise<BinData> {
	const res = await requestUrl({
		url: `${serverUrl}/api/bin/${id}`,
		method: 'GET',
	});

	if (res.status === 404) throw new Error('Bin not found');
	if (res.status === 410) throw new Error('Bin has expired');
	if (res.status !== 200) throw new Error(`Failed to fetch bin (${res.status})`);

	return res.json;
}

export async function updateBin(serverUrl: string, id: string, content: string): Promise<void> {
	const res = await requestUrl({
		url: `${serverUrl}/api/bin/${id}`,
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ content }),
	});

	if (res.status === 403) throw new Error('This bin is not editable');
	if (res.status === 404) throw new Error('Bin not found');
	if (res.status !== 200) throw new Error(`Failed to update bin (${res.status})`);
}
