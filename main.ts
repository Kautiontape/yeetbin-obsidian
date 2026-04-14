import { Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import { updateBin } from './api';
import { SendModal } from './modal';
import { PullModal } from './modal';

interface YeetbinSettings {
	serverUrl: string;
	defaultMode: 'read-only' | 'editable' | 'forkable';
	openAfterSend: 'always' | 'ask' | 'never';
	defaultType: string;
}

const DEFAULT_SETTINGS: YeetbinSettings = {
	serverUrl: 'https://yeet.kautiontape.com',
	defaultMode: 'read-only',
	openAfterSend: 'ask',
	defaultType: 'markdown',
};

export default class YeetbinPlugin extends Plugin {
	settings: YeetbinSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'send-to-yeetbin',
			name: 'Send to yeetbin',
			editorCallback: async (_editor, ctx) => {
				const file = ctx.file;
				if (!file) {
					new Notice('No active file');
					return;
				}

				const content = await this.app.vault.read(file);

				const modal = new SendModal(
					this.app,
					this.settings.serverUrl,
					content,
					this.settings.defaultMode
				);

				const result = await modal.open();
				if (!result) return;

				// Save bin ID (and key if encrypted) to frontmatter
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					fm['yeetbin-id'] = result.id;
					if (result.key) {
						fm['yeetbin-key'] = result.key;
					}
				});

				const url = result.key
					? `${result.url}#key=${result.key}`
					: result.url;

				new Notice(`Sent to yeetbin: ${url}`);
				navigator.clipboard.writeText(url);

				if (this.settings.openAfterSend === 'always') {
					window.open(url, '_blank');
				} else if (this.settings.openAfterSend === 'ask') {
					new Notice('URL copied to clipboard. Click to open.', 0);
					// Obsidian doesn't support clickable notices natively,
					// so we open it and let the user know
					window.open(url, '_blank');
				}
			},
		});

		this.addCommand({
			id: 'pull-from-yeetbin',
			name: 'Pull from yeetbin',
			editorCallback: async (editor, ctx) => {
				const file = ctx.file;
				if (!file) {
					new Notice('No active file');
					return;
				}

				// Read existing frontmatter for prefill
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				const prefillId = fm?.['yeetbin-id'] || '';
				const prefillKey = fm?.['yeetbin-key'] || '';

				const modal = new PullModal(
					this.app,
					this.settings.serverUrl,
					prefillId,
					prefillKey
				);

				const result = await modal.open();
				if (!result) return;

				// Replace file content, preserving frontmatter
				const currentContent = await this.app.vault.read(file);
				const fmEnd = this.findFrontmatterEnd(currentContent);
				const frontmatter = fmEnd > 0 ? currentContent.slice(0, fmEnd) : '';
				const newContent = frontmatter + result.content;

				await this.app.vault.modify(file, newContent);

				// Update frontmatter with the bin ID if it changed
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					fm['yeetbin-id'] = result.id;
				});

				new Notice('Pulled from yeetbin');
			},
		});

		this.addCommand({
			id: 'update-yeetbin',
			name: 'Update yeetbin',
			editorCallback: async (_editor, ctx) => {
				const file = ctx.file;
				if (!file) {
					new Notice('No active file');
					return;
				}

				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				const binId = fm?.['yeetbin-id'];

				if (!binId) {
					new Notice('No yeetbin-id in frontmatter. Use "Send to yeetbin" first.');
					return;
				}

				const content = await this.app.vault.read(file);
				// Strip frontmatter before sending
				const fmEnd = this.findFrontmatterEnd(content);
				const body = fmEnd > 0 ? content.slice(fmEnd) : content;

				try {
					await updateBin(this.settings.serverUrl, binId, body);
					new Notice(`Updated yeetbin: ${binId}`);
				} catch (e) {
					new Notice(`Failed to update: ${e instanceof Error ? e.message : e}`);
				}
			},
		});

		this.addSettingTab(new YeetbinSettingTab(this.app, this));
	}

	/**
	 * Find the end index of YAML frontmatter (including closing ---\n).
	 * Returns 0 if no frontmatter found.
	 */
	private findFrontmatterEnd(content: string): number {
		if (!content.startsWith('---')) return 0;
		const closeIdx = content.indexOf('\n---', 3);
		if (closeIdx === -1) return 0;
		// Return index after the closing ---\n
		const endIdx = content.indexOf('\n', closeIdx + 4);
		return endIdx === -1 ? closeIdx + 4 : endIdx + 1;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class YeetbinSettingTab extends PluginSettingTab {
	plugin: YeetbinPlugin;

	constructor(app: any, plugin: YeetbinPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'yeetbin' });

		new Setting(containerEl)
			.setName('Server URL')
			.setDesc('Base URL of your yeetbin instance')
			.addText((t) =>
				t
					.setPlaceholder('https://yeet.kautiontape.com')
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (v) => {
						this.plugin.settings.serverUrl = v.replace(/\/$/, '');
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Default mode')
			.setDesc('Default sharing mode for new bins')
			.addDropdown((d) =>
				d
					.addOptions({
						'read-only': 'Read-only',
						editable: 'Editable',
						forkable: 'Forkable',
					})
					.setValue(this.plugin.settings.defaultMode)
					.onChange(async (v) => {
						this.plugin.settings.defaultMode = v as YeetbinSettings['defaultMode'];
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Open after send')
			.setDesc('Open the yeetbin URL in browser after sending')
			.addDropdown((d) =>
				d
					.addOptions({
						always: 'Always',
						ask: 'Ask',
						never: 'Never',
					})
					.setValue(this.plugin.settings.openAfterSend)
					.onChange(async (v) => {
						this.plugin.settings.openAfterSend = v as YeetbinSettings['openAfterSend'];
						await this.plugin.saveSettings();
					})
			);
	}
}
