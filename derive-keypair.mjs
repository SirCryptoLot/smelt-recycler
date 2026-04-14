// Derives a Solana keypair from a BIP39 mnemonic using standard path m/44'/501'/0'/0'
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { writeFileSync } from 'fs';

const mnemonic = 'fuel pulse increase empty cruise when add gauge night minimum uphold course clump artwork awesome gentle mushroom hybrid embrace desk oval all filter replace';

const seed = mnemonicToSeedSync(mnemonic, '');
const path = "m/44'/501'/0'/0'";
const { key } = derivePath(path, seed.toString('hex'));
const keypair = Keypair.fromSeed(key);

console.log('Public key:', keypair.publicKey.toBase58());
const secretArray = Array.from(keypair.secretKey);
writeFileSync('/tmp/burner.json', JSON.stringify(secretArray));
console.log('Saved to /tmp/burner.json');
