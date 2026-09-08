import bcrypt from "bcrypt";
import prisma from "./lib/prisma.js";

const createAdmin = async () => {
  const hashedPassword = await bcrypt.hash(
    "Eli9876",
    10
  );

  await prisma.user.create({
    data: {
      username: "Eli",
      password: hashedPassword,
      phone: "11 5468-9220",
    },
  });

  console.log("Admin creado");
};

createAdmin();