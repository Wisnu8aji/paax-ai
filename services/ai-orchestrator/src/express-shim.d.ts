declare module "express" {
  export interface Request {
    body?: any;
    query: Record<string, any>;
    params: Record<string, string>;
    headers: Record<string, any>;
    ip?: string;
    user?: any;
    [key: string]: any;
  }
  export interface Response {
    status(code: number): Response;
    json(value: any): any;
    send(value?: any): any;
    end(): any;
    setHeader(name: string, value: string): void;
    write(value: string): any;
    [key: string]: any;
  }
  export type NextFunction = (error?: unknown) => void;
  export type RequestHandler = (req: Request, res: Response, next: NextFunction) => any;
  export interface Router {
    get(path: string, ...handlers: RequestHandler[]): Router;
    post(path: string, ...handlers: RequestHandler[]): Router;
    use(...args: any[]): Router;
  }
  export function Router(): Router;
  export interface ExpressApplication extends Router {
    listen(port: number, callback?: () => void): any;
  }
  interface ExpressFactory {
    (): ExpressApplication;
    json(): RequestHandler;
  }
  const express: ExpressFactory;
  export default express;
}
