import { App, Modal, Setting, Notice } from 'obsidian';
import { createBin, getBin, type CreateBinOptions } from './api';
import { encrypt, decrypt } from './crypto';

export interface SendResult {
	id: string;
	url: string;
	key?: string;
}

export class SendModal extends Modal {
	private serverUrl: string;
	private content: string;
	private resolve: (result: SendResult | null) => void;

	private mode: 'read-only' | 'editable' | 'forkable' = 'read-only';
	private expiry = '';
	private burn = false;
	private encrypted = false;
	private password = '';

	constructor(app: App, serverUrl: string, content: string, defaultMode: string) {
		super(app);
		this.serverUrl = serverUrl;
		this.content = content;
		this.mode = defaultMode as typeof this.mode;
		this.resolve = () => {};
	}

	open(): Promise<SendResult | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			super.open();
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'Send to yeetbin' });

		new Setting(contentEl)
			.setName('Mode')
			.addDropdown((d) =>
				d
					.addOptions({
						'read-only': 'Read-only',
						editable: 'Editable',
						forkable: 'Forkable',
					})
					.setValue(this.mode)
					.onChange((v) => (this.mode = v as typeof this.mode))
			);

		new Setting(contentEl)
			.setName('Expiry')
			.addDropdown((d) =>
				d
					.addOptions({
						'': 'Permanent',
						'1h': '1 hour',
						'24h': '24 hours',
						'7d': '7 days',
						'30d': '30 days',
					})
					.setValue(this.expiry)
					.onChange((v) => (this.expiry = v))
			);

		new Setting(contentEl)
			.setName('Burn after reading')
			.setDesc('Bin is deleted after the first view')
			.addToggle((t) => t.setValue(this.burn).onChange((v) => (this.burn = v)));

		new Setting(contentEl)
			.setName('Encrypt')
			.setDesc('Client-side encryption. Key will be saved in frontmatter.')
			.addToggle((t) =>
				t.setValue(this.encrypted).onChange((v) => {
					this.encrypted = v;
					if (v) this.mode = 'read-only';
				})
			);

		new Setting(contentEl)
			.setName('Password')
			.setDesc('Optional. Viewers must enter this to see the bin.')
			.addText((t) =>
				t
					.setPlaceholder('Leave empty for none')
					.onChange((v) => (this.password = v))
			);

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText('Send')
				.setCta()
				.onClick(() => this.doSend())
		);
	}

	private computeExpiresAt(): string | null {
		if (!this.expiry) return null;
		const ms: Record<string, number> = {
			'1h': 3600000,
			'24h': 86400000,
			'7d': 604800000,
			'30d': 2592000000,
		};
		return new Date(Date.now() + (ms[this.expiry] || 0)).toISOString();
	}

	private async doSend() {
		try {
			let finalContent = this.content;
			let encryptionKey: string | undefined;

			if (this.encrypted) {
				const result = await encrypt(this.content);
				finalContent = result.ciphertext;
				encryptionKey = result.key;
			}

			const opts: CreateBinOptions = {
				content: finalContent,
				type: 'markdown',
				mode: this.encrypted ? 'read-only' : this.mode,
				encrypted: this.encrypted,
				burn: this.burn,
				expires_at: this.computeExpiresAt(),
				password: this.password || undefined,
			};

			const result = await createBin(this.serverUrl, opts);

			this.resolve({
				id: result.id,
				url: `${this.serverUrl}/${result.id}`,
				key: encryptionKey,
			});
			this.close();
		} catch (e) {
			new Notice(`Failed to send: ${e instanceof Error ? e.message : e}`);
		}
	}

	onClose() {
		this.contentEl.empty();
		this.resolve(null);
	}
}

export class PullModal extends Modal {
	private serverUrl: string;
	private prefillId: string;
	private prefillKey: string;
	private resolve: (result: { content: string; id: string } | null) => void;

	private binId = '';
	private encryptionKey = '';

	constructor(app: App, serverUrl: string, prefillId = '', prefillKey = '') {
		super(app);
		this.serverUrl = serverUrl;
		this.prefillId = prefillId;
		this.prefillKey = prefillKey;
		this.binId = prefillId;
		this.encryptionKey = prefillKey;
		this.resolve = () => {};
	}

	open(): Promise<{ content: string; id: string } | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			super.open();
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: 'Pull from yeetbin' });

		new Setting(contentEl)
			.setName('Bin ID or URL')
			.setDesc('The bin ID (e.g. x7kQ3f) or full URL')
			.addText((t) =>
				t
					.setPlaceholder('Bin ID or URL')
					.setValue(this.binId)
					.onChange((v) => (this.binId = v.trim()))
			);

		new Setting(contentEl)
			.setName('Encryption key')
			.setDesc('Required if the bin is encrypted')
			.addText((t) =>
				t
					.setPlaceholder('Leave empty if not encrypted')
					.setValue(this.encryptionKey)
					.onChange((v) => (this.encryptionKey = v.trim()))
			);

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText('Pull')
				.setCta()
				.onClick(() => this.doPull())
		);
	}

	private parseId(input: string): string {
		// Accept full URL or bare ID
		try {
			const url = new URL(input);
			return url.pathname.replace(/^\//, '').split('/')[0];
		} catch {
			return input;
		}
	}

	private async doPull() {
		const id = this.parseId(this.binId);
		if (!id) {
			new Notice('Please enter a bin ID or URL');
			return;
		}

		try {
			const bin = await getBin(this.serverUrl, id);

			let content = bin.content;
			if (bin.encrypted) {
				if (!this.encryptionKey) {
					new Notice('This bin is encrypted. Please provide the encryption key.');
					return;
				}
				content = await decrypt(bin.content, this.encryptionKey);
			}

			this.resolve({ content, id });
			this.close();
		} catch (e) {
			new Notice(`Failed to pull: ${e instanceof Error ? e.message : e}`);
		}
	}

	onClose() {
		this.contentEl.empty();
		this.resolve(null);
	}
}
