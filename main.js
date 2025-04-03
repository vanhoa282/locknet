const express = require("express");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const envFile =
    process.env.NODE_ENV === "production"
        ? ".env.production"
        : ".env.development";

dotenv.config({ path: envFile });

const cors = require("cors");
const { logInfo } = require("./src/services/logger.service.js");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios"); // Thêm axios để gọi API

// Routers
const routes = require("./src/routes");
const errorHandler = require("./src/helpers/error-handler.js");

const app = express();
app.use(
    cors({
        origin: ["http://localhost:3000", "https://locket-uploader.vercel.app"],
        methods: ["GET", "POST"],
        credentials: true,
    })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

routes(app);
app.use(errorHandler);

// Cấu hình Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    logInfo("main.js", "TELEGRAM_BOT_TOKEN không được cung cấp trong .env!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Lưu trữ token của người dùng (tạm thời trong bộ nhớ, nên dùng DB thực tế)
const userTokens = new Map(); // Key: chatId, Value: token

// Xử lý lệnh /login
bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1];
    const password = match[2];

    try {
        // Gọi API đăng nhập của server
        const response = await axios.post(`http://localhost:${PORT}/login`, {
            username,
            password,
        });

        const { token } = response.data; // Giả sử server trả về token
        if (token) {
            userTokens.set(chatId, token); // Lưu token cho chatId
            bot.sendMessage(chatId, "Đăng nhập thành công! Bạn có thể upload ảnh bây giờ.");
        } else {
            bot.sendMessage(chatId, "Đăng nhập thất bại: Không nhận được token.");
        }
    } catch (error) {
        bot.sendMessage(chatId, "Đăng nhập thất bại: " + (error.response?.data?.message || error.message));
    }
});

// Xử lý ảnh khi người dùng gửi
bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const token = userTokens.get(chatId);

    if (!token) {
        bot.sendMessage(chatId, "Bạn cần đăng nhập trước! Dùng /login {username} {password}");
        return;
    }

    const photoId = msg.photo[msg.photo.length - 1].file_id; // Lấy ảnh chất lượng cao nhất
    const fileUrl = await bot.getFileLink(photoId);

    try {
        // Gọi API upload của server với token
        const response = await axios.post(
            `http://localhost:${PORT}/upload`, // Thay bằng endpoint thực tế
            { imageUrl: fileUrl },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        bot.sendMessage(chatId, "Upload ảnh thành công!");
    } catch (error) {
        bot.sendMessage(chatId, "Upload thất bại: " + (error.response?.data?.message || error.message));
    }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logInfo("main.js", `Server backend is running at localhost:${PORT}`);
    logInfo("main.js", "Telegram Bot đã được khởi động!");
});
