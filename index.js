const { ethers } = require("ethers");
const prompt = require("prompt-sync")({ sigint: true }); // Modul untuk input pengguna
require("dotenv").config();
const fs = require("fs");

// Ambil konfigurasi dari .env
const PRIVATE_KEYS = process.env.PRIVATE_KEYS ? process.env.PRIVATE_KEYS.split(",") : [];
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const RPC_URL = process.env.RPC_URL || "https://";
const GAS_TOKEN = process.env.GAS_TOKEN || "ETH";

if (!PRIVATE_KEYS.length || !TOKEN_ADDRESS) {
    console.error("Harap isi PRIVATE_KEYS dan TOKEN_ADDRESS di file .env");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallets = PRIVATE_KEYS.map(privateKey => new ethers.Wallet(privateKey.trim(), provider));

// Fungsi untuk membaca alamat dari file
const readAddressesFromFile = (filePath) => {
    try {
        const addresses = fs.readFileSync(filePath, "utf8").split("\n").map(line => line.trim()).filter(line => line.length > 0);
        return addresses;
    } catch (error) {
        console.error("Gagal membaca file alamat:", error);
        process.exit(1);
    }
};

// Fungsi untuk mengirim token ERC-20
const sendToken = async (fromWallet, toAddress, tokenContract, amount) => {
    try {
        const tx = await tokenContract.connect(fromWallet).transfer(toAddress, amount, {
            gasLimit: 210000,
            gasPrice: await provider.getFeeData().then(data => data.gasPrice),
        });
        await tx.wait();
        return tx;
    } catch (error) {
        console.error("Error saat mengirim token:", error);
        throw error;
    }
};

// Fungsi untuk meminta input pengguna
const getUserInput = () => {
    const tokenAmount = prompt("Masukkan jumlah token yang akan ditransfer (contoh: 212): ");
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
        console.error("Jumlah token tidak valid. Harus berupa angka positif.");
        process.exit(1);
    }

    const walletCount = prompt("Masukkan jumlah wallet tujuan yang akan diproses (contoh: 10): ");
    if (isNaN(walletCount) || walletCount <= 0) {
        console.error("Jumlah wallet tidak valid. Harus berupa angka positif.");
        process.exit(1);
    }

    return { tokenAmount: parseFloat(tokenAmount), walletCount: parseInt(walletCount) };
};

(async () => {
    // Minta input dari pengguna
    const { tokenAmount, walletCount } = getUserInput();

    const addressesFile = "addresses.txt";
    let addresses = readAddressesFromFile(addressesFile);

    if (addresses.length === 0) {
        console.error("Tidak ada alamat yang ditemukan di file.");
        process.exit(1);
    }

    // Batasi jumlah alamat sesuai input pengguna atau maksimum 150
    if (addresses.length > walletCount) {
        console.log(`Daftar alamat melebihi ${walletCount}. Hanya akan memproses ${walletCount} alamat pertama.`);
        addresses = addresses.slice(0, walletCount);
    }
    if (addresses.length > 150) {
        console.warn("Daftar alamat melebihi 150. Hanya akan memproses 150 alamat pertama.");
        addresses = addresses.slice(0, 150);
    }

    // Inisialisasi kontrak token
    const tokenContract = new ethers.Contract(
        TOKEN_ADDRESS,
        ["function transfer(address to, uint256 amount) public returns (bool)"],
        provider
    );

    const amountToSend = ethers.parseUnits(tokenAmount.toString(), 18); // Konversi jumlah token ke wei
    let completedTransactions = 0; // Counter untuk transaksi yang selesai

    console.log(`Mengirim ${tokenAmount} token ke setiap alamat...`);
    console.log(`Total alamat yang akan diproses: ${addresses.length}`);

    for (let i = 0; i < addresses.length; i++) {
        const toAddress = addresses[i];
        const walletIndex = i % wallets.length; // Rotasi antara wallets

        if (!ethers.isAddress(toAddress)) {
            console.error(`Alamat ${toAddress} tidak valid. Melewati...`);
            continue;
        }

        const wallet = wallets[walletIndex];

        try {
            console.log(`[${completedTransactions + 1}/${addresses.length}] Mengirim ${tokenAmount} token dari wallet ${walletIndex} ke ${toAddress}...`);
            const tx = await sendToken(wallet, toAddress, tokenContract, amountToSend);
            completedTransactions++; // Tambah counter setelah transaksi berhasil
            console.log(`Transaksi berhasil. Tx Hash: ${tx.hash}`);
            console.log(`Status: ${completedTransactions} dari ${addresses.length} transaksi selesai (${((completedTransactions / addresses.length) * 100).toFixed(2)}%)`);

            // Jeda acak antara 3-7 detik
            const delay = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
            console.log(`Menunggu ${delay/1000} detik sebelum transaksi berikutnya...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            console.error(`Gagal mengirim ke ${toAddress} dari wallet ${walletIndex}:`, error);
            // Coba lagi setelah jeda 60 detik
            await new Promise(resolve => setTimeout(resolve, 60000));
            continue;
        }
    }

    console.log("Semua transaksi selesai.");
    console.log(`Total transaksi yang berhasil: ${completedTransactions} dari ${addresses.length}`);
    console.log(`Persentase keberhasilan: ${((completedTransactions / addresses.length) * 100).toFixed(2)}%`);
})();
