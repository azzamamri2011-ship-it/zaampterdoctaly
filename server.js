const express = require("express");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE = "users.json";

/* ================= HELPER ================= */

function getUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, "[]");
    }
    return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* ================= RANDOM PASSWORD ================= */

function generatePassword(length = 12) {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

/* ================= LOGIN ================= */

app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (
        email === process.env.ADMIN_EMAIL &&
        password === process.env.ADMIN_PASSWORD
    ) {
        return res.json({ success: true, role: "admin" });
    }

    const users = getUsers();
    const user = users.find(
        (u) => u.email === email && u.password === password
    );

    if (user) {
        return res.json({ success: true, role: "member" });
    }

    return res.json({ success: false });
});

/* ================= CREATE MEMBER ================= */

app.post("/api/createMember", (req, res) => {
    const { adminEmail, email, password } = req.body;

    if (adminEmail !== process.env.ADMIN_EMAIL) {
        return res.json({ success: false });
    }

    const users = getUsers();

    if (users.find((u) => u.email === email)) {
        return res.json({ success: false });
    }

    users.push({ email, password });
    saveUsers(users);

    return res.json({ success: true });
});

/* ================= CREATE SERVER (AUTO PASSWORD) ================= */

app.post("/api/createServer", async (req, res) => {
    const { username, packageSize } = req.body;

    if (!username || !packageSize) {
        return res.json({ success: false });
    }

    let memoryLimit;
    let diskLimit;
    let cpuLimit;

    if (packageSize === "unlimited") {
        memoryLimit = 0;
        diskLimit = 0;
        cpuLimit = 0;
    } else {
        const gb = parseInt(packageSize);
        memoryLimit = gb * 1024;
        diskLimit = gb * 1024;
        cpuLimit = gb * 100;
    }

    try {

        /* ===== AUTO GENERATE PASSWORD ===== */

        const randomPassword = generatePassword(14);

        /* ===== CREATE USER DI PTERO ===== */

        const newUser = await axios.post(
            `${process.env.PTERO_URL}/api/application/users`,
            {
                username: username.toLowerCase(),
                email: `${username}@panel.local`,
                first_name: username,
                last_name: "Server",
                password: randomPassword
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PTERO_PTLA}`,
                    Accept: "Application/vnd.pterodactyl.v1+json"
                }
            }
        );

        const pteroUserId = newUser.data.attributes.id;

        /* ===== CREATE SERVER ===== */

        const server = await axios.post(
            `${process.env.PTERO_URL}/api/application/servers`,
            {
                name: username,
                user: pteroUserId,
                egg: 15,
                docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
                startup: "npm start",
                environment: {},
                limits: {
                    memory: memoryLimit,
                    swap: 0,
                    disk: diskLimit,
                    io: 500,
                    cpu: cpuLimit
                },
                feature_limits: {
                    databases: 1,
                    allocations: 1,
                    backups: 1
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PTERO_PTLA}`,
                    Accept: "Application/vnd.pterodactyl.v1+json"
                }
            }
        );

        const domain = process.env.PANEL_DOMAIN || "Not Set";

        return res.json({
            success: true,
            domain: domain,
            username: username,
            password: randomPassword,
            serverId: server.data.attributes.id
        });

    } catch (err) {
        console.log(err.response?.data || err.message);

        return res.json({
            success: false,
            message: "Gagal membuat server"
        });
    }
});

/* ================= START SERVER ================= */

app.post("/api/startServer", async (req, res) => {
    const { serverId } = req.body;

    try {
        await axios.post(
            `${process.env.PTERO_URL}/api/client/servers/${serverId}/power`,
            { signal: "start" },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PTERO_PTLC}`,
                    Accept: "Application/vnd.pterodactyl.v1+json"
                }
            }
        );

        return res.json({ success: true });

    } catch (err) {
        return res.json({ success: false });
    }
});

/* ================= EXPORT ================= */

module.exports = app;
