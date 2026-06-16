// QR Code generator utility
// Generates QR code as base64 string for digital signature

import { Platform } from "react-native";

// Generate QR code using external API (works on all platforms)
export async function generateQRCodeBase64(data: string, size: number = 200): Promise<string> {
  // Use QR Server API to generate QR code
  const encodedData = encodeURIComponent(data);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedData}&format=png&margin=10`;
  
  try {
    const response = await fetch(qrUrl);
    if (!response.ok) throw new Error("Failed to generate QR code");
    
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("QR generation error:", error);
    throw error;
  }
}

// Generate signature QR data
export function buildSignatureQRData(profile: any): string {
  const data = {
    business: profile.name || "Luar Jendela Creatrip",
    npwp: profile.npwp || "",
    phone: profile.phone || "",
    email: profile.email || "",
    verified: new Date().toISOString(),
    type: "digital_signature",
  };
  
  // Create a simple verification string
  return JSON.stringify(data);
}

// Generate verification URL for QR
export function buildVerificationURL(businessId: string, invoiceId?: string): string {
  const baseUrl = "https://verify.luarjendela.com"; // Placeholder verification URL
  if (invoiceId) {
    return `${baseUrl}/invoice/${invoiceId}?bid=${businessId}`;
  }
  return `${baseUrl}/business/${businessId}`;
}
