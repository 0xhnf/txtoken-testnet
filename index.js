const { ethers } = require("ethers");
const prompt = require("prompt-sync")({ sigint: true });
require("dotenv").config();
const fs = require("fs");

// Ambil konfigurasi dari .env
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const RPC_URL = process.env.RPC_URL || "";
const GAS_TOKEN = process.env.GAS_TOKEN || "ETH";

// Validasi konfigurasi awal
if (!TOKEN_ADDRESS) {
    console.error("Error: TOKEN_ADDRESS tidak ditemukan di file .env");
    process.exit(1);
}
if (!RPC_URL) {
    console.error("Error: RPC_URL tidak ditemukan atau kosong di file .env");
    process.exit(1);
}

// Inisialisasi provider di cakupan global
let provider;
try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
} catch (error) {
    console.error("Error: Gagal menginisialisasi provider dengan RPC_URL:", error.message);
    process.exit(1);
}

// Fungsi untuk membaca private keys dari file
const readPrivateKeys = (filePath) => {
    try {
        const privateKeys = fs.readFileSync(filePath, "utf8")
            .split("\n")
            .map(key => key.trim())
            .filter(key => key.length > 0);
        if (!privateKeys.length) {
            throw new Error("File privateKeys.txt kosong atau tidak valid.");
        }
        return privateKeys;
    } catch (error) {
        console.error("Gagal membaca file privateKeys.txt:", error.message);
        process.exit(1);
    }
};

// Fungsi untuk membaca alamat dari file
const readAddressFromFile = (filePath) => {
    try {
        const address = fs.readFileSync(filePath, "utf8")
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0);
        if (!addresses.length) {
            throw new Error("File address.txt kosong atau tidak valid.");
        }
        return address;
    } catch (error) {
        console.error("Gagal membaca file alamat:", error.message);
        process.exit(1);
    }
};

// Fungsi untuk mengacak array (Fisher-Yates shuffle)
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// Fungsi untuk menghasilkan alamat wallet acak
const generateRandomWallets = (count) => {
    const addresses = [];
    for (let i = 0; i < count; i++) {
        const wallet = ethers.Wallet.createRandom();
        address.push(wallet.address);
    }
    return address;
};

// Fungsi untuk mengirim token ERC-20
const sendToken = async (fromWallet, toAddress, tokenContract, amount) => {
    try {
        // Ambil nonce terbaru dari provider
        const nonce = await provider.getTransactionCount(fromWallet.address, "pending");
        const gasPrice = await provider.getFeeData().then(data => data.gasPrice).catch(err => {
            throw new Error(`Gagal mendapatkan gasPrice: ${err.message}`);
        });
        const tx = await tokenContract.connect(fromWallet).transfer(toAddress, amount, {
            gasLimit: 210000,
            gasPrice,
            nonce,
        });
        const receipt = await tx.wait();
        return receipt;
    } catch (error) {
        console.error(`Error saat mengirim token ke ${toAddress}:`, error.message);
        throw error;
    }
};

// Fungsi untuk meminta input pengguna
const getUserInput = () => {
    const tokenAmount = prompt("Masukkan jumlah token yang akan ditransfer (contoh: 100): ");
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
        console.error("Jumlah token tidak valid. Harus berupa angka positif.");
        process.exit(1);
    }

    const walletCount = prompt("Masukkan jumlah wallet tujuan yang akan diproses (contoh: 10): ");
    if (isNaN(walletCount) || walletCount <= 0) {
        console.error("Jumlah wallet tidak valid. Harus berupa angka positif.");
        process.exit(1);
    }

    const recipientMode = prompt("Pilih mode penerima (tujuan/random): ").toLowerCase();
    if (!["tujuan", "random"].includes(recipientMode)) {
        console.error("Mode penerima tidak valid. Harus 'tujuan' atau 'random'.");
        process.exit(1);
    }

    return {
        tokenAmount: parseFloat(tokenAmount),
        walletCount: parseInt(walletCount),
        recipientMode
    };
};

// Fungsi utama
(async () => {
    // Baca private keys dan inisialisasi wallets
    const privateKeys = readPrivateKeys("privateKeys.txt");
    const wallets = privateKeys.map(privateKey => new ethers.Wallet(privateKey.trim(), provider));

    // Minta input dari pengguna
    const { tokenAmount, walletCount, recipientMode } = getUserInput();

    // Siapkan daftar alamat penerima
    let address = [];
    if (recipientMode === "tujuan") {
        const addressFile = "address.txt";
        address = readAddressFromFile(addressFile);

        // Validasi jumlah alamat
        if (address.length < walletCount) {
            console.error(`Jumlah alamat di address.txt (${address.length}) kurang dari jumlah yang diminta (${walletCount}).`);
            process.exit(1);
        }

        // Acak alamat dari addresses.txt
        address = shuffleArray([...address]);

        // Batasi jumlah alamat sesuai input pengguna
        if (addresses.length > walletCount) {
            console.log(`Daftar alamat melebihi ${walletCount}. Hanya akan memproses ${walletCount} alamat pertama.`);
            addresses = address.slice(0, walletCount);
        }
        if (addresses.length > 150) {
            console.warn("Daftar alamat melebihi 150. Hanya akan memproses 150 alamat pertama.");
            address = address.slice(0, 150);
        }
    } else if (recipientMode === "random") {
        // Hasilkan alamat acak sebanyak walletCount
        address = generateRandomWallets(walletCount);

        // Batasi hingga 150 alamat
        if (address.length > 150) {
            console.warn("Jumlah alamat melebihi 150. Hanya akan memproses 150 alamat pertama.");
            address = address.slice(0, 150);
        }
    }

    // Tampilkan informasi sebelum transaksi
    console.log("\n=== Informasi Transaksi ===");
    console.log(`Jumlah token yang akan ditransfer per alamat: ${tokenAmount}`);
    console.log(`Jumlah wallet penerima: ${address.length}`);
    console.log(`Mode penerima: ${recipientMode}${recipientMode === "random" ? " (alamat acak)" : " (acak dari address.txt)"}`);
    console.log("Daftar alamat penerima:");
    addresses.forEach((addr, i) => console.log(`  ${i + 1}. ${addr}`));
    console.log("==========================\n");

    // Konfirmasi sebelum memulai
    const confirm = prompt("Lanjutkan transaksi? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("Transaksi dibatalkan.");
        process.exit(0);
    }

    // Inisialisasi kontrak token
    const tokenContract = new ethers.Contract(
        TOKEN_ADDRESS,
        ["function transfer(address to, uint256 amount) public returns (bool)"],
        provider
    );

    const amountToSend = ethers.parseUnits(tokenAmount.toString(), 18); // Konversi jumlah token ke wei
    let completedTransactions = 0;

    console.log(`\nMengirim ${tokenAmount} token ke setiap alamat...`);

    for (let i = 0; i < address.length; i++) {
        const toAddress = address[i];
        const walletIndex = i % wallets.length; // Rotasi antara wallets

        if (!ethers.isAddress(toAddress)) {
            console.error(`Alamat ${toAddress} tidak valid. Melewati...`);
            continue;
        }

        const wallet = wallets[walletIndex];

        try {
            console.log(`[${completedTransactions + 1}/${address.length}] Mengirim ${tokenAmount} token dari wallet ${walletIndex} ke ${toAddress}...`);
            const tx = await sendToken(wallet, toAddress, tokenContract, amountToSend);
            completedTransactions++;
            console.log(`Transaksi berhasil. Tx Hash: ${tx.transactionHash || tx.hash}`);
            console.log(`Status: ${completedTransactions} dari ${address.length} transaksi selesai (${((completedTransactions / address.length) * 100).toFixed(2)}%)`);

            // Jeda acak antara 3-7 detik
            const delay = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
            console.log(`Menunggu ${delay/1000} detik sebelum transaksi berikutnya...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            console.error(`Gagal mengirim ke ${toAddress} dari wallet ${walletIndex}:`, error.message);
            console.error(`Mencoba lagi setelah 60 detik...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
            continue;
        }
    }

    console.log("\n=== Ringkasan Transaksi ===");
    console.log(`Total transaksi yang berhasil: ${completedTransactions} dari ${address.length}`);
    console.log(`Persentase keberhasilan: ${((completedTransactions / addresses.length) * 100).toFixed(2)}%`);
    console.log("==========================");
})();
