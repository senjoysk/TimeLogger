declare module 'express-basic-auth' {
  import { RequestHandler } from 'express';

  interface BasicAuthOptions {
    users?: { [username: string]: string };
    authorizer?: (username: string, password: string, callback: (err: Error | null, authorized?: boolean) => void) => void;
    authorizeAsync?: boolean;
    challenge?: boolean;
    challengeText?: string;
    realm?: string;
    unauthorizedResponse?: any;
  }

  function basicAuth(options: BasicAuthOptions): RequestHandler;
  export = basicAuth;
}