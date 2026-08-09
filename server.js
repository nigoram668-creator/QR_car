const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = path.join(__dirname, "cars.json");

let cars = [];

if (fs.existsSync(DATA_FILE)) {
  try {
    cars = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    if (!Array.isArray(cars)) {
      cars = [];
    }
  } catch (error) {
    cars = [];
  }
}

function saveCars() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(cars, null, 2),
    "utf8"
  );
}


/* =========================
   PAROLNI HASH QILISH
========================= */

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}


/* =========================
   TOKEN
========================= */

function createToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

const sessions = new Map();


/* =========================
   LOGIN TEKSHIRISH
========================= */

function auth(req, res, next) {

  const header =
    req.headers.authorization || "";

  const token =
    header.replace(/^Bearer\s+/i, "");

  const session =
    sessions.get(token);

  if (!session) {

    return res.status(401).json({
      error: "Login va parol kerak"
    });

  }

  const car =
    cars.find(
      c => c.qr_id === session.qr_id
    );

  if (!car) {

    sessions.delete(token);

    return res.status(401).json({
      error: "Profil topilmadi"
    });

  }

  req.car = car;
  req.token = token;

  next();
}


/* =========================
   QR ID YARATISH
========================= */

function generateQRId() {

  let number = 1;

  while (
    cars.some(
      car =>
        car.qr_id ===
        "QRCAR" +
        String(number).padStart(4, "0")
    )
  ) {

    number++;

  }

  return (
    "QRCAR" +
    String(number).padStart(4, "0")
  );
}


/* =========================
   QR GENERATOR
========================= */

app.post(
  "/api/admin/generate-qr",
  (req, res) => {

    let count =
      Number(req.body.count || 1);

    if (
      !Number.isInteger(count) ||
      count < 1
    ) {
      count = 1;
    }

    if (count > 1000) {
      count = 1000;
    }

    const ids = [];

    for (
      let i = 0;
      i < count;
      i++
    ) {

      const id = generateQRId();

      cars.push({

        qr_id: id,

        claimed: false,

        name: "",

        phone: "",

        car_number: "",

        car_model: "",

        info: "",

        username: "",

        password_hash: "",

        created_at: null,

        updated_at: null

      });

      ids.push(id);

    }

    saveCars();

    res.json({

      success: true,

      ids: ids

    });

  }
);


/* =========================
   QR RO‘YXATI
========================= */

app.get(
  "/api/admin/qr-list",
  (req, res) => {

    res.json(

      cars.map(car => ({

        qr_id: car.qr_id,

        claimed:
          !!car.claimed,

        name:
          car.name || "",

        car_number:
          car.car_number || ""

      }))

    );

  }
);


/* =========================
   QR MA'LUMOTI
   LOGIN KERAK EMAS
========================= */

app.get(
  "/api/car/:id",
  (req, res) => {

    const car =
      cars.find(
        c => c.qr_id === req.params.id
      );

    if (!car) {

      return res.status(404).json({
        error: "QR topilmadi"
      });

    }

    res.json({

      qr_id:
        car.qr_id,

      claimed:
        !!car.claimed,

      name:
        car.name || "",

      phone:
        car.phone || "",

      car_number:
        car.car_number || "",

      car_model:
        car.car_model || "",

      info:
        car.info || ""

    });

  }
);


/* =========================
   REGISTRATSIYA
========================= */

app.post(
  "/api/register",
  (req, res) => {

    const {
qr_id,

      name,

      phone,

      car_number,

      car_model,

      info,

      username,

      login,

      password

    } = req.body;


    const userLogin =
      String(
        username ||
        login ||
        ""
      ).trim();


    const userPassword =
      String(
        password || ""
      );


    if (!qr_id) {

      return res.status(400).json({
        error: "QR ID kerak"
      });

    }


    if (!name || !name.trim()) {

      return res.status(400).json({
        error: "Ismni kiriting"
      });

    }


    if (!phone || !phone.trim()) {

      return res.status(400).json({
        error: "Telefon raqamni kiriting"
      });

    }


    if (!userLogin) {

      return res.status(400).json({
        error: "Loginni kiriting"
      });

    }


    if (userPassword.length < 4) {

      return res.status(400).json({
        error:
          "Parol kamida 4 ta belgidan iborat bo‘lsin"
      });

    }


    const car =
      cars.find(
        c => c.qr_id === qr_id
      );


    if (!car) {

      return res.status(404).json({
        error: "Bunday QR mavjud emas"
      });

    }


    if (car.claimed) {

      return res.status(409).json({
        error:
          "Bu QR allaqachon ro‘yxatdan o‘tgan"
      });

    }


    const loginExists =
      cars.some(
        c =>
          c.claimed &&
          c.username === userLogin
      );


    if (loginExists) {

      return res.status(409).json({
        error:
          "Bu login band. Boshqa login tanlang."
      });

    }


    car.claimed = true;

    car.name =
      String(name).trim();

    car.phone =
      String(phone).trim();

    car.car_number =
      String(car_number || "").trim();

    car.car_model =
      String(car_model || "").trim();

    car.info =
      String(info || "").trim();

    car.username =
      userLogin;

    car.password_hash =
      hashPassword(userPassword);

    car.created_at =
      new Date().toISOString();

    car.updated_at =
      new Date().toISOString();


    saveCars();


    res.json({

      success: true,

      qr_id:
        car.qr_id,

      message:
        "Registratsiya muvaffaqiyatli"

    });

  }
);


/* =========================
   LOGIN
========================= */

app.post(
  "/api/login",
  (req, res) => {

    const username =
      String(
        req.body.username ||
        req.body.login ||
        ""
      ).trim();


    const password =
      String(
        req.body.password ||
        ""
      );


    if (!username || !password) {

      return res.status(400).json({
        error:
          "Login va parolni kiriting"
      });

    }


    const car =
      cars.find(
        c =>
          c.claimed &&
          c.username === username
      );


    if (
      !car ||
      car.password_hash !==
        hashPassword(password)
    ) {

      return res.status(401).json({
        error:
          "Login yoki parol xato"
      });

    }


    const token =
      createToken();


    sessions.set(
      token,
      {
        qr_id:
          car.qr_id
      }
    );


    res.json({

      success: true,

      token:

        token,

      qr_id:

        car.qr_id

    });

  }
);


/* =========================
   MENING PROFILIM
========================= */

app.get(
  "/api/me",
  auth,
  (req, res) => {

    const car =
      req.car;

    res.json({

      qr_id:
        car.qr_id,

      name:
        car.name,

      phone:
        car.phone,

      car_number:
        car.car_number,

      car_model:
        car.car_model,

      info:
        car.info

    });

  }
);


/* =========================
   PROFILNI TAHRIRLASH
========================= */

app.put(
  "/api/me",
  auth,
  (req, res) => {

    const {

      name,

      phone,

      car_number,

      car_model,

      info,

      password

    } = req.body;


    if (name !== undefined) {

      req.car.name =
        String(name).trim();

    }


    if (phone !== undefined) {

      req.car.phone =
        String(phone).trim();

    }
if (
      car_number !== undefined
    ) {

      req.car.car_number =
        String(car_number).trim();

    }


    if (
      car_model !== undefined
    ) {

      req.car.car_model =
        String(car_model).trim();

    }


    if (
      info !== undefined
    ) {

      req.car.info =
        String(info).trim();

    }


    if (
      password !== undefined &&
      String(password).length >= 4
    ) {

      req.car.password_hash =
        hashPassword(password);

    }


    req.car.updated_at =
      new Date().toISOString();


    saveCars();


    res.json({

      success: true,

      message:
        "Ma'lumotlar saqlandi"

    });

  }
);


/* =========================
   LOGOUT
========================= */

app.post(
  "/api/logout",
  auth,
  (req, res) => {

    sessions.delete(
      req.token
    );

    res.json({
      success: true
    });

  }
);


/* =========================
   QR PNG
========================= */

app.get(
  "/api/qr/:id.png",
  async (req, res) => {

    try {

      const car =
        cars.find(
          c =>
            c.qr_id ===
            req.params.id
        );


      if (!car) {

        return res
          .status(404)
          .send("QR topilmadi");

      }


      const base =
        String(
          req.query.base ||
          ${req.protocol}://${req.get("host")}
        ).replace(
          /\/$/,
          ""
        );


      const url =
        base +
        "/car/" +
        encodeURIComponent(
          car.qr_id
        );


      const png =
        await QRCode.toBuffer(
          url,
          {

            width: 600,

            margin: 2,

            errorCorrectionLevel:
              "M"

          }
        );


      res
        .type("png")
        .send(png);


    } catch (error) {

      res
        .status(500)
        .send(
          "QR yaratishda xato"
        );

    }

  }
);


/* =========================
   PROFIL SAHIFASI
========================= */

app.get(
  "/car/:id",
  (req, res) => {

    const file =
      path.join(
        __dirname,
        "public",
        "car.html"
      );


    if (
      fs.existsSync(file)
    ) {

      return res.sendFile(
        file
      );

    }


    const car =
      cars.find(
        c =>
          c.qr_id ===
          req.params.id
      );


    if (
      !car ||
      !car.claimed
    ) {

      return res
        .status(404)
        .send(
          "QR topilmadi"
        );

    }


    res.send(

      <!DOCTYPE html>

      <html lang="uz">

      <head>

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        >

        <title>QR CAR</title>

      </head>

      <body
        style="
          font-family:Arial;
          padding:25px;
        "
      >

        <h2>
          🚗 QR CAR
        </h2>

        <h3>
          ${escapeHtml(car.name)}
        </h3>

        <p>
          🚘 ${escapeHtml(car.car_model)}
        </p>

        <p>
          🔢 ${escapeHtml(car.car_number)}
        </p>

        <p>
          📞
          <a
            href="tel:${escapeAttr(car.phone)}"
          >
            ${escapeHtml(car.phone)}
          </a>
        </p>

        <p>
          ${escapeHtml(car.info)}
        </p>

      </body>

      </html>

    );

  }
);


/* =========================
   XAVFSIZ HTML
========================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


function escapeAttr(value) {

  return String(
    value ?? ""
  ).replace(
    /[^0-9+()\- ]/g,
    ""
  );

}


/* =========================
   BOSH SAHIFA
========================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);
/* =========================
   SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      QR CAR server ${PORT} portda ishlayapti
    );

  }
);
