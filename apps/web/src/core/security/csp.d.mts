export declare const THEME_BOOTSTRAP_SCRIPT: string;
export interface CspInput {
  apiUrl: string | undefined;
  firebaseAuthDomain?: string | undefined;
  dev?: boolean;
}
export declare function baseDirectives(input: CspInput): string[];
export declare const SCRIPT_RESOURCES: string[];
export declare const STYLE_RESOURCES: string[];
export declare function headerPolicy(input: CspInput): string;
