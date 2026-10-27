import type { Save } from '../save.ts';
/** Shared navigation/persistence boundary; each mode owns its own page. */
export type CampaignHost={save:()=>Save;store:()=>void;editProfile?:()=>void;levelSelect?:()=>void};
