export class FurAffinityError extends Error {
    constructor(message: string, private status: number, private url: string) {
        super(message);
    }
}
