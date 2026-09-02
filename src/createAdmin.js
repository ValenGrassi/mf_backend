import bcrypt from "bcrypt";
import prisma from "./lib/prisma.js";

const createAdmin = async () => {
  const hashedPassword = await bcrypt.hash(
    "Martin9876",
    10
  );

  await prisma.user.create({
    data: {
      username: "Martin",
      password: hashedPassword,
      phone: "11 6412-9259",
    },
  });

  console.log("Admin creado");
};

createAdmin();