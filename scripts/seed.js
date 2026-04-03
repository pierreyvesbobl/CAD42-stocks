const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const PRODUITS = [
  { notion_id:'3345d5cd375f81a985f1f1d42b7e7237', reference:'RTK.42 Safety — 1 capteur',  famille:'RTK',        statut:'Produit fini', prix_ht:1541.67, stock_actuel:0, seuil_alerte:1  },
  { notion_id:'3345d5cd375f81dd92ded1f70585e0e5', reference:'RTK.42 Safety — 2 capteurs', famille:'RTK',        statut:'Produit fini', prix_ht:1577.62, stock_actuel:0, seuil_alerte:0  },
  { notion_id:'3345d5cd375f8180b96fce65c90bc2bd', reference:'Gyro-sirène',                 famille:'RTK',        statut:'Produit fini', prix_ht:1000.00, stock_actuel:0, seuil_alerte:0  },
  { notion_id:'3345d5cd375f8160b307d9984bf06b73', reference:'KYD.42',                      famille:'Kit',        statut:'Produit fini', prix_ht:110.00,  stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f81e48f8fffff0112d721', reference:'KYD.42 Gyro',                 famille:'Kit',        statut:'Produit fini', prix_ht:110.04,  stock_actuel:0, seuil_alerte:0  },
  { notion_id:'3345d5cd375f81ca8dddd73423df85e8', reference:'KYD.42 Transfo',              famille:'Kit',        statut:'Produit fini', prix_ht:110.54,  stock_actuel:0, seuil_alerte:0  },
  { notion_id:'3345d5cd375f81768fbeda92f2ae6e07', reference:'Valise KYD.42',               famille:'Kit',        statut:'Produit fini', prix_ht:1100.00, stock_actuel:0, seuil_alerte:0  },
  { notion_id:'3345d5cd375f81ec874cfd0b2cef1c8b', reference:'LiDAR.42',                    famille:'Autre',      statut:'Produit fini', prix_ht:1522.99, stock_actuel:0, seuil_alerte:0  },
  { notion_id:'3345d5cd375f8110bec9c6e9ca766676', reference:'Raspberry PI 3 modèle B+ 1Gb',               famille:'Accessoire', statut:'Composant', prix_ht:41.40,  stock_actuel:0, seuil_alerte:3  },
  { notion_id:'3345d5cd375f8146be34f741c0d38049', reference:'Boulon raspberry pi M2,5',                   famille:'Accessoire', statut:'Composant', prix_ht:0.10,   stock_actuel:0, seuil_alerte:20 },
  { notion_id:'3345d5cd375f8153a3d9c372e297a39a', reference:'Carte SD Sandisk',                           famille:'Accessoire', statut:'Composant', prix_ht:6.11,   stock_actuel:0, seuil_alerte:3  },
  { notion_id:'3345d5cd375f811695bcf26a012efb57', reference:'Witty Pi 4 Mini',                            famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:3  },
  { notion_id:'3345d5cd375f81e998a5de573cac61d0', reference:'GPS RTK Ublox',                              famille:'RTK',        statut:'Composant', prix_ht:175.00, stock_actuel:0, seuil_alerte:2  },
  { notion_id:'3345d5cd375f81099495f10515b8974c', reference:'Clé 4G Huawei E3372 320',                    famille:'Gateway',    statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:3  },
  { notion_id:'3345d5cd375f8128be7dd4099f20c0c5', reference:'Câble',                                      famille:'Accessoire', statut:'Composant', prix_ht:2.50,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f8170a2d0ec4641df7001', reference:'Cable alimentation 22 AWG',                  famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f8108be3fcb75adec4dda', reference:'Batterie LifeBatteries + embouts 2,5 mm',    famille:'Accessoire', statut:'Composant', prix_ht:544.00, stock_actuel:0, seuil_alerte:2  },
  { notion_id:'3345d5cd375f813f825edf2cc723b570', reference:'Embout pour chargeur TP',                    famille:'Accessoire', statut:'Composant', prix_ht:1.08,   stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f8188a739ce202c7b323f', reference:'Chargeur 4,2V TP4056',                       famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:3  },
  { notion_id:'3345d5cd375f81fcb567cfef89cd1ca7', reference:'Chargeurs Mascot 2541 2A',                   famille:'Accessoire', statut:'Composant', prix_ht:55.00,  stock_actuel:0, seuil_alerte:2  },
  { notion_id:'3345d5cd375f81da8e0deb5d38ac047b', reference:'Embout chargeur Mascot 2,5 x 5,5 mm',        famille:'Accessoire', statut:'Composant', prix_ht:1.12,   stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f81419b01d25a3ca35e3b', reference:'Boitier de protection',                      famille:'Accessoire', statut:'Composant', prix_ht:1.47,   stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f812f897fc8fef6177174', reference:'Chargeur USB Basetech SUC-4900/4',            famille:'Accessoire', statut:'Composant', prix_ht:13.13,  stock_actuel:0, seuil_alerte:2  },
  { notion_id:'3345d5cd375f811f9c8def63d666f1b2', reference:'Boitier interne pour électronique',          famille:'Accessoire', statut:'Composant', prix_ht:15.66,  stock_actuel:0, seuil_alerte:2  },
  { notion_id:'3345d5cd375f814da267ef9d0f40038c', reference:'Presse-étoupes M12 (PG07)',                   famille:'Accessoire', statut:'Composant', prix_ht:0.17,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f81aa8daccaf2c88f4737', reference:'Presse-étoupes PG11 (M16)',                   famille:'Accessoire', statut:'Composant', prix_ht:0.31,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f8197b3faea08ac592c24', reference:'Equerre externe',                             famille:'Accessoire', statut:'Composant', prix_ht:19.00,  stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f8107a5cffc31c3b602e8', reference:'Plaque de fond galvanisée',                   famille:'Accessoire', statut:'Composant', prix_ht:13.80,  stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f814aafc0ea7c853b22b3', reference:'Aimant en pot avec trou fraisé Ø 40 mm',     famille:'Accessoire', statut:'Composant', prix_ht:4.16,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f8178b80df0ec23df24c5', reference:'Boulon M4 L20 inox - tête autofraisée plate', famille:'Accessoire', statut:'Composant', prix_ht:1.31,   stock_actuel:0, seuil_alerte:20 },
  { notion_id:'3345d5cd375f814bab74f4d1314ce690', reference:"Joint d'étanchéité",                         famille:'Accessoire', statut:'Composant', prix_ht:0.34,   stock_actuel:0, seuil_alerte:20 },
  { notion_id:'3345d5cd375f8103a57bde4ee566c676', reference:'Boitier',                                     famille:'Accessoire', statut:'Composant', prix_ht:41.19,  stock_actuel:0, seuil_alerte:2  },
  { notion_id:'3345d5cd375f8168a741e9aa92345099', reference:'Cable de sécu inox 1,5m M4 embouts à chape D8', famille:'Accessoire', statut:'Composant', prix_ht:40.00, stock_actuel:0, seuil_alerte:2 },
  { notion_id:'3345d5cd375f81c5891de5248522ba35', reference:'Tournette',                                   famille:'Accessoire', statut:'Composant', prix_ht:13.23,  stock_actuel:0, seuil_alerte:1  },
  { notion_id:'3345d5cd375f81b2a901f4634237cd50', reference:'PCB KYD Transfo vierge',                      famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f8123a5bedd8000ae0d8c', reference:'Condensateur 0,1 uF',                         famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:20 },
  { notion_id:'3345d5cd375f81278aebd4a065b7a1e3', reference:'Condensateur 0,33 uF',                        famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:20 },
  { notion_id:'3345d5cd375f8169b8aae33763ccd0b9', reference:'Resistance 1k Ohm',                           famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:20 },
  { notion_id:'3345d5cd375f8112a10df5711e61fbc8', reference:'TIP120',                                      famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f81b283f2f02c09dbfa26', reference:'Régulateur de tension L7805',                 famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f81ef87d9fad455e6098d', reference:'Attiny85',                                    famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f815e83bedd485786877c', reference:'LED',                                         famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f8174a310e089033f3c3c', reference:'Cable rouge et noir 1m',                      famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f81678e96f654a5da5bf3', reference:'Cable rouge et noir 0,5m',                    famille:'Accessoire', statut:'Composant', prix_ht:0.50,   stock_actuel:0, seuil_alerte:5  },
  { notion_id:'3345d5cd375f81faadc1dddc9b2a45fa', reference:'Gyro Rouge',                                  famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:3  },
  { notion_id:'3345d5cd375f811c807bd95fbbe7b916', reference:'Diode Protec 1n4001',                         famille:'Accessoire', statut:'Composant', prix_ht:0.04,   stock_actuel:0, seuil_alerte:20 },
  { notion_id:'3345d5cd375f819681bedfba21d45119', reference:'Wago 2',                                      famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f81c0a970cd7ee9650a58', reference:'Wago 3',                                      famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f81f58c1ce4047a7471f9', reference:'Wago 5',                                      famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:10 },
  { notion_id:'3345d5cd375f81d6af94d000a60c9c07', reference:'Valise TOMcase',                              famille:'Accessoire', statut:'Composant', prix_ht:0.00,   stock_actuel:0, seuil_alerte:1  },
  { notion_id:'3345d5cd375f811f9e68eceb0af9f110', reference:'Avertisseur sonore',                          famille:'Accessoire', statut:'Composant', prix_ht:142.66, stock_actuel:0, seuil_alerte:1  },
  { notion_id:'3345d5cd375f81269458c0de74632e5e', reference:'Balise Fixe à LED',                           famille:'Accessoire', statut:'Composant', prix_ht:130.91, stock_actuel:0, seuil_alerte:1  },
  { notion_id:'3345d5cd375f810fa4f8e721fc2d03ab', reference:'Clé 4G Alcatel',                              famille:'Gateway',    statut:'Composant', prix_ht:35.00,  stock_actuel:0, seuil_alerte:2  },
];

const NOMENCLATURES = [
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8110bec9c6e9ca766676',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8146be34f741c0d38049',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8153a3d9c372e297a39a',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f811695bcf26a012efb57',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f81e998a5de573cac61d0',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f81099495f10515b8974c',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8128be7dd4099f20c0c5',2],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8170a2d0ec4641df7001',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8108be3fcb75adec4dda',2],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f813f825edf2cc723b570',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8188a739ce202c7b323f',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f81fcb567cfef89cd1ca7',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f81da8e0deb5d38ac047b',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f81419b01d25a3ca35e3b',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f812f897fc8fef6177174',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f811f9c8def63d666f1b2',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f814da267ef9d0f40038c',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f81aa8daccaf2c88f4737',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8197b3faea08ac592c24',1],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8107a5cffc31c3b602e8',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f814aafc0ea7c853b22b3',4],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8178b80df0ec23df24c5',4],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f814bab74f4d1314ce690',8],['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8103a57bde4ee566c676',1],
  ['3345d5cd375f81a985f1f1d42b7e7237','3345d5cd375f8168a741e9aa92345099',1],
  ['3345d5cd375f81dd92ded1f70585e0e5','3345d5cd375f81a985f1f1d42b7e7237',2],['3345d5cd375f81dd92ded1f70585e0e5','3345d5cd375f81c5891de5248522ba35',1],
  ['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f8110bec9c6e9ca766676',1],['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f811695bcf26a012efb57',1],
  ['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f814da267ef9d0f40038c',1],['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f81aa8daccaf2c88f4737',2],
  ['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f81419b01d25a3ca35e3b',1],['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f8107a5cffc31c3b602e8',1],
  ['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f8197b3faea08ac592c24',1],['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f811f9c8def63d666f1b2',1],
  ['3345d5cd375f8180b96fce65c90bc2bd','3345d5cd375f819681bedfba21d45119',1],
  ['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f8160b307d9984bf06b73',1],['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f81b2a901f4634237cd50',1],
  ['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f8123a5bedd8000ae0d8c',1],['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f81278aebd4a065b7a1e3',1],
  ['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f8169b8aae33763ccd0b9',2],['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f8112a10df5711e61fbc8',1],
  ['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f81b283f2f02c09dbfa26',1],['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f81ef87d9fad455e6098d',1],
  ['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f815e83bedd485786877c',1],['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f8174a310e089033f3c3c',1],
  ['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f81faadc1dddc9b2a45fa',1],['3345d5cd375f81e48f8fffff0112d721','3345d5cd375f811c807bd95fbbe7b916',1],
  ['3345d5cd375f81ca8dddd73423df85e8','3345d5cd375f8160b307d9984bf06b73',1],['3345d5cd375f81ca8dddd73423df85e8','3345d5cd375f81b2a901f4634237cd50',1],
  ['3345d5cd375f81ca8dddd73423df85e8','3345d5cd375f81b283f2f02c09dbfa26',1],['3345d5cd375f81ca8dddd73423df85e8','3345d5cd375f8123a5bedd8000ae0d8c',1],
  ['3345d5cd375f81ca8dddd73423df85e8','3345d5cd375f81278aebd4a065b7a1e3',1],['3345d5cd375f81ca8dddd73423df85e8','3345d5cd375f811c807bd95fbbe7b916',1],
  ['3345d5cd375f81ca8dddd73423df85e8','3345d5cd375f81678e96f654a5da5bf3',1],
  ['3345d5cd375f81768fbeda92f2ae6e07','3345d5cd375f81d6af94d000a60c9c07',1],['3345d5cd375f81768fbeda92f2ae6e07','3345d5cd375f8160b307d9984bf06b73',10],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f8197b3faea08ac592c24',1],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f8107a5cffc31c3b602e8',1],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f814aafc0ea7c853b22b3',8],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f8178b80df0ec23df24c5',8],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f81419b01d25a3ca35e3b',1],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f8110bec9c6e9ca766676',1],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f811695bcf26a012efb57',1],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f81099495f10515b8974c',1],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f8153a3d9c372e297a39a',1],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f8108be3fcb75adec4dda',2],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f81f58c1ce4047a7471f9',3],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f81c0a970cd7ee9650a58',3],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f819681bedfba21d45119',2],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f81aa8daccaf2c88f4737',1],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f814da267ef9d0f40038c',1],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f8146be34f741c0d38049',4],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f811f9e68eceb0af9f110',1],['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f81269458c0de74632e5e',1],
  ['3345d5cd375f81ec874cfd0b2cef1c8b','3345d5cd375f810fa4f8e721fc2d03ab',1],
];

async function seed() {
  const { data: produits, error: e1 } = await sb.from('produits')
    .upsert(PRODUITS, { onConflict: 'notion_id' }).select('id,notion_id');
  if (e1) { console.error(e1); process.exit(1); }
  console.log(`✅ ${produits.length} produits`);

  const map = Object.fromEntries(produits.map(p => [p.notion_id, p.id]));
  const rows = NOMENCLATURES.map(([a,c,q]) => ({
    produit_assemble_id: map[a], composant_id: map[c], quantite: q
  })).filter(r => r.produit_assemble_id && r.composant_id);

  const { error: e2 } = await sb.from('nomenclatures')
    .upsert(rows, { onConflict: 'produit_assemble_id,composant_id' });
  if (e2) { console.error(e2); process.exit(1); }
  console.log(`✅ ${rows.length} nomenclatures — Seed terminé`);
}
seed().catch(console.error);
