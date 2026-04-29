import * as Minio from "minio"


export async function  getNiceSignedUrl(
    key: string,
    expiry: number = 300,
): Promise<string> {
    const client = new Minio.Client({
        endPoint: "localhost",
        port: 9000,
        useSSL: false,
        accessKey: "minioadmin",
        secretKey: "minioadmin"
    });

    const result = await client.presignedGetObject('asan-pos', key, expiry);

    return result;
}