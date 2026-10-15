/** Preview-only intro gate. It has no imports from screens, campaign, audio or storage. */
export type IntroState = 'closed'|'overview'|'flying'|'landed'|'walking'|'disposed';
export class TerrainIntro {
  state:IntroState='closed';
  open(){if(this.state==='disposed')return false;this.state='overview';return true;}
  fly(){if(this.state!=='overview')return false;this.state='flying';return true;}
  land(){if(this.state!=='flying')return false;this.state='landed';return true;}
  explore(){if(this.state!=='overview' && this.state!=='landed')return false;this.state='walking';return true;}
  cancel(){if(this.state==='disposed')return false;this.state='closed';return true;}
  dispose(){this.state='disposed';}
}
