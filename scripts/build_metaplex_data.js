const { createUmi } = require('@metaplex-foundation/umi');
const { web3JsEddsa } = require('@metaplex-foundation/umi-eddsa-web3js');
const { getCreateMetadataAccountV3InstructionDataSerializer } = require('@metaplex-foundation/mpl-token-metadata');

const umi = createUmi().use(web3JsEddsa());

const serializer = getCreateMetadataAccountV3InstructionDataSerializer();

const data = serializer.serialize({
  discriminator: 33,
  data: {
    name: 'Goldium',
    symbol: 'GOLD',
    uri: 'https://gold-miner.vercel.app/token-metadata.json',
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  },
  isMutable: true,
  collectionDetails: null,
});

console.log('Data length:', data.length);
console.log('Data hex:', Buffer.from(data).toString('hex'));
console.log('First byte (discriminator):', data[0]);
console.log('Bytes 1-4 (name len):', Buffer.from(data.slice(1, 5)).readUInt32LE(0));
console.log('Name:', Buffer.from(data.slice(5, 5+7)).toString());
