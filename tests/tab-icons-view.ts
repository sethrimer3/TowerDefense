import '../src/style.css';
import '../src/theme.css';
import { t } from '../src/i18n/index.ts';
import { TAB_ICON_NAMES, TAB_ICON_VARIANTS, paintTabIcon, type TabIconName, type TabIconVariant } from '../src/ui/tab-icons.ts';

document.documentElement.classList.add('pixel-font');
const captions: Record<TabIconName, readonly string[]> = {
  defend: ['Tower & shield', 'Steel shield', 'Castle gate'],
  ambush: ['Hood & bow', 'Road & arrow', 'Crossed arrows'],
  siege: ['Trebuchet', 'Battering ram', 'Catapult'],
  settings: ['Brass cog', 'Steel cog', 'Arcane cog'],
};

function iconCard(name: TabIconName, caption: string, titleText: string, variant?: TabIconVariant) {
  const card = document.createElement('article');
  card.dataset.icon = name;
  card.dataset.variant = variant ?? 'selected';
  const title = document.createElement('h3');
  title.textContent = titleText;
  const study = document.createElement('canvas');
  study.className = 'study';
  study.setAttribute('role', 'img');
  study.setAttribute('aria-label', `${t(`nav.${name}`)}: ${caption}`);
  paintTabIcon(study, name, variant);
  const sample = document.createElement('div');
  sample.className = 'sample-tab';
  sample.setAttribute('aria-hidden', 'true');
  const small = document.createElement('canvas');
  paintTabIcon(small, name, variant);
  const label = document.createElement('span');
  label.textContent = t(`nav.${name}`);
  sample.append(small, label);
  const description = document.createElement('p');
  description.className = 'caption';
  description.textContent = caption;
  card.append(title, study, sample, description);
  return card;
}

const selected = ['Tower & shield', 'Castle gate', 'Sword', 'Steel cog'];
for (const [index, name] of TAB_ICON_NAMES.entries()) {
  document.querySelector('#selected')!.append(iconCard(name, selected[index], t(`nav.${name}`)));
}

for (const name of TAB_ICON_NAMES) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = t(`nav.${name}`);
  section.append(heading);
  const options = document.createElement('div');
  options.className = 'options';
  for (const [index, variant] of TAB_ICON_VARIANTS.entries()) {
    options.append(iconCard(name, captions[name][index], variant.toUpperCase(), variant));
  }
  section.append(options);
  document.querySelector('#gallery')!.append(section);
}
