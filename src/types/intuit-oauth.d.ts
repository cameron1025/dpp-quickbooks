declare module "intuit-oauth" {
  class OAuthClient {
    constructor(config: {
      clientId: string;
      clientSecret: string;
      environment: string;
      redirectUri: string;
      logging?: boolean;
    });

    static scopes: {
      Accounting: string;
      Payment: string;
      OpenId: string;
      Email: string;
      Profile: string;
    };

    authorizeUri(params: { scope: string[]; state: string }): string;
    createToken(url: string): Promise<any>;
    refresh(): Promise<any>;
    revoke(params: { access_token: string }): Promise<any>;
    getUserInfo(): Promise<any>;
    getToken(): any;
    setToken(token: any): void;
  }

  export default OAuthClient;
}