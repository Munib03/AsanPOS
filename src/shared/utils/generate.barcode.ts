import * as bwipjs from 'bwip-js';


export async function generateBarcode(text: string): Promise<string> {
    const buffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale: 2,
      height: 15,
      includetext: false,
    });

    return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
  }